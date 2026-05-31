import express, { type Request, type Response } from "express";
import { config } from "./config.js";

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
    <p>Chirpy has been visited ${config.fileserverHits} times!</p>
  </body>
</html>`;
  res.send(html);
};

const handleResetCount = (req: Request, res: Response) => {
  config.fileserverHits = 0;
  res.send();
};

const handleValidation = (req: Request, res: Response) => {
  type parameters = {
    body: string;
  };

  const params: parameters = req.body;

  const maxChirpLength = 140;

  if (params.body.length > maxChirpLength) {
    throw new Error();
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

  const validResp = JSON.stringify({
    cleanedBody: cleanedText,
  });
  res.status(200).send(validResp);
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
  config.fileserverHits++;
  next();
};

const errorHandlerMiddleware = (
  err: Error,
  req: Request,
  res: Response,
  next: VoidFunction,
) => {
  console.error(err);
  res.status(500).json({
    error: "Something went wrong on our end",
  });
};

// App.
const app = express();
const PORT = 8080;

app.use(middlewareLogResponses);

app.use(express.json());

app.use("/app", middlewareMetricsInc, express.static("./src/app"));

app.use("/admin/metrics", handleCounts);

app.get("/api/healthz", handleReadiness);

app.post("/admin/reset", handleResetCount);

app.post("/api/validate_chirp", async (req, res, next) => {
  try {
    await handleValidation(req, res);
  } catch (err) {
    next(err);
  }
});

app.use(errorHandlerMiddleware);

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
