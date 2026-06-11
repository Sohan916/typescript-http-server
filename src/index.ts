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
import { createUser, deleteAllUsers } from "./db/queries/users.js";
import { createChirp, getChirp, getChirps } from "./db/queries/chirps.js";

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

const handleValidation = async (req: Request, res: Response) => {
  type parameters = {
    body: string;
    userId: string;
  };

  const params: parameters = req.body;

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
    userId: params.userId,
  };

  const createdChirp = await createChirp(chirp);

  res.status(201).send(createdChirp);
};

const handleCreateUser = async (req: Request, res: Response) => {
  type parameters = {
    email: string;
  };

  const params: parameters = req.body;

  if (!params.email) {
    throw new BadRequestError("Missing required fields");
  }

  const user = {
    email: params.email,
  };

  if (!params.email) {
    throw new BadRequestError("Missing required fields");
  }

  const createdUser = await createUser(user);

  if (!user) {
    throw new Error("Could not create user");
  }

  res.status(201).json(createdUser);
};

const handleGetChirps = async (req: Request, res: Response) => {
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
    await handleValidation(req, res);
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

app.use(errorMiddleware);

app.listen(config.api.port, () => {
  console.log(`Server is running at http://localhost:${config.api.port}`);
});
