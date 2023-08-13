import { WebSocketServer } from "ws";
import { v4 as uuidv4 } from "uuid";
import { faker } from "@faker-js/faker";

const wss = new WebSocketServer({ port: 9009 });

const games = new Map();
const users = new Map();

const game = {
  phase: "guess",
  match: 1,
  alpha: {
    user: {},
    turn: false,
    win: 0,
    number: ["5", "0", "4", "2"],
    guesses: [
      {
        number: ["1", "2", "3", "4"],
        placed: 2,
        square: 1,
      },
    ],
  },
  delta: {
    user: {},
    turn: true,
    win: 0,
    number: ["1", "2", "4", "5"],
    guesses: [],
  },
};

wss.on("connection", function connection(ws) {
  ws.on("error", console.error);

  const uuid = uuidv4();

  ws.on("message", function message(data) {
    try {
      const message = JSON.parse(data);
      const { type, id, payload } = message;
      switch (type) {
        case "get-user":
          getUser(ws, id);

          break;
        case "set-user-name":
          setUserName(ws, id, payload);

          break;
        case "create-game":
          createGame(ws, id);

          break;
        case "join-game":
          joinGame(ws, id, payload);

          break;
        case "set-number":
          setNumber(ws, id, payload);

          break;
        case "guess-number":
          guessNumber(ws, id, payload);

          break;
        case "new-game":
          newGame(ws, id, payload);

          break;
        case "end-game":
          closeBoth(ws, id)

          break;
        case "info":
          info(ws, id);
          break;
        default:
          break;
      }
    } catch (err) {
      console.error(err);
    }
  });

  ws.on("close", function close() {
    try {
      console.log("close", uuid);
      //closeBoth(ws, uuid);
    } catch (err) {
      console.error(err);
    }
  });

  users.set(uuid, { id: uuid, ws: ws });

  send(ws, "id", { id: uuid });
});

function send(ws, type, payload) {
  const message = JSON.stringify({
    type,
    payload,
  });
  ws.send(message);
}

function sendGame(ws, game) {
  const gameAlpha = JSON.parse(JSON.stringify(game, replacer));
  const gameDelta = JSON.parse(JSON.stringify(game, replacer));

  if (game.phase !== "end") {
    if (gameAlpha.delta) {
      gameAlpha.delta.number = null;
    }

    if (gameDelta.alpha) {
      gameDelta.alpha.number = null;
    }
  }

  if (game.alpha) {
    send(game.alpha.user.ws, "game", gameAlpha);
  }

  if (game.delta) {
    send(game.delta.user.ws, "game", gameDelta);
  }
}

function closeBoth(ws, id) {
  const user = users.get(id);
  if (!user) {
    return;
  }

  const gameName = user.gameName;

  const game = games.get(gameName);
  if (game) {
    game.alpha.user.gameName = '';
    game.delta.user.gameName = ''
  } else {
    user.gameName = '';
  }

  games.delete(gameName);
}

function getUser(ws, id) {
  const user = users.get(id);

  if (!user) {
    return;
  }

  user.ws = ws;

  if (user.gameName) {
    const game = games.get(user.gameName);
    if (game) {
      sendGame(ws, game);
    }
  } else {
    user.gameName = "";
  }

  const { ws: _ws, ...payload } = user;

  send(ws, "user", payload);
}

function setUserName(ws, id, { name }) {
  const user = users.get(id);

  user.name = name;
}

function createGame(ws, id) {
  const gameName = faker.word.noun({
    length: { min: 5, max: 8 },
    strategy: "closest",
  });

  const user = users.get(id);
  user.gameName = gameName;
  user.playerTag = "alpha";

  const game = {
    name: gameName,
    phase: "wait-for-delta",
    match: 1,
    [id]: "alpha",
    alpha: {
      user: users.get(id),
      turn: true,
      win: 0,
      guesses: [],
    },
  };

  games.set(gameName, game);

  send(ws, "game", game);
}

function joinGame(ws, id, { name }) {
  const game = games.get(name);

  game[id] = "delta";
  game.phase = "choose";

  const user = users.get(id);
  user.gameName = game.name;
  user.playerTag = "delta";

  game.delta = {
    user: users.get(id),
    turn: false,
    win: 0,
    guesses: [],
  };

  sendGame(ws, game);
}

function setNumber(ws, id, { gameName, number }) {
  const game = games.get(gameName);
  const { player } = getPlayerAndOpponent(game, id);

  player.number = number.split("");

  if (game.alpha.number && game.delta.number) {
    game.phase = "guess";
  }

  sendGame(ws, game);
}

function guessNumber(ws, id, { gameName, number }) {
  const game = games.get(gameName);
  const { player, opponent } = getPlayerAndOpponent(game, id);

  if (!player.turn) {
    return;
  }

  player.turn = false;
  opponent.turn = true;

  const theNumber = opponent.number;
  const guess = number.split("");
  const { placed, square } = checkNumber(theNumber, guess);

  opponent.guesses.push({
    number: guess,
    placed: placed,
    square: square,
  });

  if (placed === 4) {
    game.phase = "end";
    game.winnerName = player.user.name;
    player.win += 1;
  }

  sendGame(ws, game);
}

function newGame(ws, id, { gameName }) {
  const game = games.get(gameName);

  if(!game) {
    return;
  }

  game.match += 1;

  if (game.match % 2 === 0) {
    game.alpha.turn = false;
    game.delta.turn = true;
  } else {
    game.alpha.turn = true;
    game.delta.turn = false;
  }

  game.alpha.number = null;
  game.delta.number = null;

  game.alpha.guesses = [];
  game.delta.guesses = [];

  game.phase = "choose";

  sendGame(ws, game);
}

function getPlayerAndOpponent(game, id) {
  const playerTag = game[id];
  const opponentTag = playerTag === "alpha" ? "delta" : "alpha";

  const player = game[playerTag];
  const opponent = game[opponentTag];

  return { player, opponent };
}

function checkNumber(number, guess) {
  let placed = 0;
  let square = 0;

  guess.forEach((digit, index) => {
    if (number.includes(digit)) {
      if (number.indexOf(digit) === index) {
        placed += 1;
      } else {
        square += 1;
      }
    }
  });

  return { placed, square };
}

function info(ws, id) {
  console.log(users.get(id));
  console.log(games);
  send(ws, { user: users.get(id) });
}

function replacer(key, value) {
  if (key == "wc") {
    return undefined;
  }

  return value;
}
