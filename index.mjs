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
        case "info":
          info(ws, id);
          break;
        default:
          break;
      }

      console.log(users);
      console.log(games);
    } catch (err) {
      console.error(err);
    }
  });

  ws.on("close", function close() {
    try {
      console.log("close", uuid);
      closeBoth(ws, uuid);
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
  const gameAlpha = JSON.parse(JSON.stringify(game));
  const gameDelta = JSON.parse(JSON.stringify(game));

  if (game.phase !== "end") {
    gameAlpha.delta.number = null;
    gameDelta.alpha.number = null;
  }

  send(game.alpha.user.ws, "game", gameAlpha);
  send(game.delta.user.ws, "game", gameDelta);
}

function closeBoth(ws, id) {
  const user = users.get(id);
  if (!user) {
    return;
  }

  const gameName = user.gameName;

  const game = games.get(gameName);
  if (game) {
    users.delete(game.alpha.user.id);
    users.delete(game.delta.user.id);
  } else {
    users.delete(id);
  }

  games.delete(gameName);
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

  const game = {
    name: gameName,
    phase: "wait-for-delta",
    match : 1,
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
