import express, { type Request, type Response } from "express";
import { config, envOrThrow } from "./config.js";
import {
  BadRequestError,
  NotFoundError,
  UserForbiddenError,
  UserNotAuthenticatedError,
} from "./app/errors.js";
import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import {
  createUser,
  deleteAllUsers,
  getUserByEmail,
  updateChirpyToRed,
  updateUserById,
} from "./db/queries/users.js";
import {
  createChirp,
  deleteChirp,
  getChirp,
  getChirpByAuthorId,
  getChirps,
} from "./db/queries/chirps.js";
import {
  checkPasswordHash,
  getAPIKey,
  getBearerToken,
  hashPassword,
  LoginResponse,
  makeJWT,
  makeRefreshToken,
  validateJWT,
} from "./auth.js";
import {
  createRefreshToken,
  getUserFromRefreshToken,
  updateUserFromRefreshToken,
} from "./db/queries/refresh-tokens.js";

const migrationClient = postgres(config.db.url, { max: 1 });
await migrate(drizzle(migrationClient), config.db.migrationConfig);

// Handlers.
const handleReadiness = (req: Request, res: Response) => {
  res.set("Content-Type", "text/plain");
  res.status(200).send("OK");
};

const handleCounts = (req: Request, res: Response) => {
  res.set("Content-Type", "text/html;charset=utf-8");

  const html = `<html>
  <body>
    <h1>Welcome, Chirpy Admin</h1>
    <p>Chirpy has been visited ${config.api.fileServerHits} times!</p>
  </body>
</html>`;
  res.send(html);
};

const handleReset = async (req: Request, res: Response) => {
  if (envOrThrow("PLATFORM") !== "dev") {
    console.log(config.api.platform);
    throw new UserForbiddenError("Reset is only allowed in dev environment.");
  }

  await deleteAllUsers();
  config.api.fileServerHits = 0;
  res.send();
};

const handleChirpSubmission = async (req: Request, res: Response) => {
  type parameters = {
    body: string;
    userId: string;
  };

  const bearerToken = getBearerToken(req);
  const params: parameters = req.body;

  const userID = validateJWT(bearerToken, config.jwt.secret);

  if (!userID) {
    throw new UserForbiddenError("Incorrect Authentication token");
  }

  const maxChirpLength = 140;

  if (params.body.length > maxChirpLength) {
    throw new BadRequestError(
      `Chirp is too long. Max length is ${maxChirpLength}`,
    );
  }

  const censorWords = (text: string, replaceText: string[]) => {
    let newText = text;
    replaceText.forEach((element) => {
      let newReplaceText = element.toLowerCase();
      if (text.toLowerCase().includes(newReplaceText)) {
        let textArray = newText.split(" ");
        let newArray = [...textArray];
        for (let i = 0; i < newArray.length; i++) {
          if (newArray[i].toLowerCase() === newReplaceText) {
            newArray[i] = "****";
          }
        }
        newText = newArray.join(" ");
      }
    });
    return newText;
  };

  const cleanedText = censorWords(params.body, [
    "kerfuffle",
    "sharbert",
    "fornax",
  ]);

  const chirp = {
    body: cleanedText,
    userId: userID,
  };

  const createdChirp = await createChirp(chirp);

  res.status(201).send(createdChirp);
};

const handleCreateUser = async (req: Request, res: Response) => {
  type parameters = {
    email: string;
    password: string;
  };

  const params: parameters = req.body;
  const hashedPassword = await hashPassword(params.password);

  const user = {
    email: params.email,
    hashedPassword: hashedPassword,
  };

  if (!params.email || !params.password) {
    throw new BadRequestError("Missing required fields");
  }

  const createdUser = await createUser(user);

  if (!user) {
    throw new Error("Could not create user");
  }

  res.status(201).json(createdUser);
};

const handleGetChirps = async (req: Request, res: Response) => {
  let authorId = "";
  let authorIdQuery = req.query.authorId;
  if (typeof authorIdQuery === "string") {
    authorId = authorIdQuery;
    const chirps = await getChirpByAuthorId(authorId);
    res.json(chirps);
    return;
  }

  const chirps = await getChirps();
  res.json(chirps);
};

const handleGetChirp = async (req: Request, res: Response) => {
  const chirpId = req.params.chirpId;

  if (typeof chirpId !== "string") {
    throw new BadRequestError("Invalid chirp ID");
  }

  const chirp = await getChirp(chirpId);
  if (!chirp) {
    throw new NotFoundError(`Chirp with chirpId: ${chirpId} not found`);
  }
  res.json(chirp);
};

const handleDeleteChirp = async (req: Request, res: Response) => {
  const chirpId = req.params.chirpId;

  if (typeof chirpId !== "string") {
    throw new BadRequestError("Invalid chirp ID");
  }
  const bearerToken = getBearerToken(req);
  const userID = validateJWT(bearerToken, config.jwt.secret);

  const chirp = await getChirp(chirpId);
  if (!chirp) {
    throw new NotFoundError(`Chirp with chirpId: ${chirpId} not found`);
  }

  if (userID !== chirp.userId) {
    res.status(403).send();
    return;
  }

  const deletedChirp = await deleteChirp(chirpId);

  if (!deletedChirp) {
    throw new NotFoundError(`Chirp with chirpId: ${chirpId} not found`);
  }

  res.status(204).send();
};

const handleLoginUser = async (req: Request, res: Response) => {
  type Parameters = {
    email: string;
    password: string;
  };

  const params: Parameters = req.body;

  const user = {
    email: params.email,
    password: params.password,
  };

  const result = await getUserByEmail(user.email);

  if (!result) {
    res.status(401).json({ error: "incorrect email or password" });
    return;
  }

  const isPasswordMatching = await checkPasswordHash(
    user.password,
    result.hashedPassword,
  );

  if (!isPasswordMatching) {
    res.status(401).json({ error: "incorrect mail or password" });
    return;
  }

  let duration = 3600;

  const accessToken = makeJWT(result.id, duration, config.jwt.secret);
  const refreshTokenExpiry = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

  const refresh = await createRefreshToken({
    token: makeRefreshToken(),
    userId: result.id,
    expiresAt: refreshTokenExpiry,
    revokedAt: null,
  });

  const newResult = {
    id: result.id,
    createdAt: result.createdAt,
    updatedAt: result.updatedAt,
    email: result.email,
    token: accessToken,
    refreshToken: refresh.token,
    isChirpyRed: result.isChirpyRed,
  } satisfies LoginResponse;

  res.send(newResult);
};

const handleRefresh = async (req: Request, res: Response) => {
  const bearerToken = getBearerToken(req);

  const user = await getUserFromRefreshToken(bearerToken);

  if (
    user === undefined ||
    user.revokedAt !== null ||
    user.expiresAt < new Date(Date.now())
  ) {
    res.status(401).json({ error: "Refresh token does not exist" });
    return;
  }

  let duration = 3600;

  const accessToken = makeJWT(user.userId, duration, config.jwt.secret);

  res.status(200).send({
    token: accessToken,
  });
};

const handleRevoke = async (req: Request, res: Response) => {
  const bearerToken = getBearerToken(req);

  const refreshToken = await getUserFromRefreshToken(bearerToken);

  refreshToken.revokedAt = new Date(Date.now());
  refreshToken.updatedAt = refreshToken.revokedAt;

  updateUserFromRefreshToken(refreshToken.token, refreshToken);

  res.status(204).send();
};

const handleUserUpdate = async (req: Request, res: Response) => {
  const bearerToken = getBearerToken(req);

  const userID = validateJWT(bearerToken, config.jwt.secret);

  if (!userID) {
    res.status(401).send();
    return;
  }

  type Parameters = {
    email: string;
    password: string;
  };

  const params: Parameters = req.body;

  if (!params.email || !params.password) {
    throw new BadRequestError("Missing required fields");
  }

  const hashedPassword = await hashPassword(params.password);

  const user = {
    email: params.email,
    hashedPassword: hashedPassword,
  };

  if (!user) {
    throw new Error("Could not update user");
  }

  await updateUserById(userID, user);
  const updatedUser = await getUserByEmail(user.email);

  res.status(200).send({
    id: updatedUser.id,
    createdAt: updatedUser.createdAt,
    updatedAt: updatedUser.updatedAt,
    email: updatedUser.email,
  });
};

const handlePolkaWebhook = async (req: Request, res: Response) => {
  type Parameters = {
    event: string;
    data: {
      userId: string;
    };
  };

  const params: Parameters = req.body;

  if (params.event !== "user.upgraded") {
    res.status(204).send();
    return;
  }

  const key = getAPIKey(req);

  if (key !== config.api.polkaKey) {
    throw new UserNotAuthenticatedError("User not authenticated");
  }

  const chirp = await updateChirpyToRed(params.data.userId);

  if (!chirp) {
    throw new NotFoundError(`Chirp not found`);
  }

  res.status(204).send();
};

// Middlewares.
const middlewareLogResponses = (
  req: Request,
  res: Response,
  next: VoidFunction,
) => {
  res.on("finish", () => {
    const statusCode = res.statusCode;
    if (statusCode !== 200) {
      console.log(`[NON-OK] ${req.method} ${req.url} - Status: ${statusCode}`);
    }
  });

  next();
};

const middlewareMetricsInc = (
  req: Request,
  res: Response,
  next: VoidFunction,
) => {
  config.api.fileServerHits++;
  next();
};

const errorMiddleware = (
  err: Error,
  req: Request,
  res: Response,
  next: VoidFunction,
) => {
  let statusCode = 500;
  let message = "Something went wrong on our end";

  if (err instanceof BadRequestError) {
    statusCode = 400;
    message = err.message;
  } else if (err instanceof UserNotAuthenticatedError) {
    statusCode = 401;
    message = err.message;
  } else if (err instanceof UserForbiddenError) {
    statusCode = 403;
    message = err.message;
  } else if (err instanceof NotFoundError) {
    statusCode = 404;
    message = err.message;
  }

  if (statusCode >= 500) {
    console.log(err.message);
  }

  res.status(statusCode).json({ error: message });
};

// App.
const app = express();

app.use(middlewareLogResponses);

app.use(express.json());

app.use("/app", middlewareMetricsInc, express.static("./src/app"));

app.use("/admin/metrics", async (req, res, next) => {
  try {
    await handleCounts(req, res);
  } catch (err) {
    next(err);
  }
});

app.get("/api/healthz", async (req, res, next) => {
  try {
    await handleReadiness(req, res);
  } catch (err) {
    next(err);
  }
});

app.get("/api/chirps", async (req, res, next) => {
  try {
    await handleGetChirps(req, res);
  } catch (err) {
    next(err);
  }
});

app.get("/api/chirps/:chirpId", async (req, res, next) => {
  try {
    await handleGetChirp(req, res);
  } catch (err) {
    next(err);
  }
});

app.post("/admin/reset", async (req, res, next) => {
  try {
    await handleReset(req, res);
  } catch (err) {
    next(err);
  }
});

app.post("/api/chirps", async (req, res, next) => {
  try {
    await handleChirpSubmission(req, res);
  } catch (err) {
    next(err);
  }
});

app.post("/api/users", async (req, res, next) => {
  try {
    await handleCreateUser(req, res);
  } catch (err) {
    next(err);
  }
});

app.post("/api/login", async (req, res, next) => {
  try {
    await handleLoginUser(req, res);
  } catch (err) {
    next(err);
  }
});

app.post("/api/refresh", async (req, res, next) => {
  try {
    await handleRefresh(req, res);
  } catch (err) {
    next(err);
  }
});

app.post("/api/revoke", async (req, res, next) => {
  try {
    await handleRevoke(req, res);
  } catch (err) {
    next(err);
  }
});

app.post("/api/polka/webhooks", async (req, res, next) => {
  try {
    await handlePolkaWebhook(req, res);
  } catch (err) {
    next(err);
  }
});

app.put("/api/users", async (req, res, next) => {
  try {
    await handleUserUpdate(req, res);
  } catch (err) {
    next(err);
  }
});

app.delete("/api/chirps/:chirpId", async (req, res, next) => {
  try {
    await handleDeleteChirp(req, res);
  } catch (err) {
    next(err);
  }
});

app.use(errorMiddleware);

app.listen(config.api.port, () => {
  console.log(`Server is running at http://localhost:${config.api.port}`);
});
