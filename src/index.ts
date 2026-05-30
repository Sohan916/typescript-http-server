import express, { type Request, type Response } from "express";
import { config } from "./config.js";

// Handlers.
const handleReadiness = (req: Request, res: Response) => {
  res.set("Content-Type", "text/plain");
  res.status(200).send("OK");
};

const handleCounts = (req: Request, res: Response) => {
  res.send(`Hits: ${config.fileserverHits}`);
};

const handleResetCount = (req: Request, res: Response) => {
  config.fileserverHits = 0;
  res.send();
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

// App.
const app = express();
const PORT = 8080;

app.use(middlewareLogResponses);

app.use("/app", middlewareMetricsInc, express.static("./src/app"));

app.get("/api/healthz", handleReadiness);

app.get("/api/metrics", handleCounts);

app.get("/api/reset", handleResetCount);

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
