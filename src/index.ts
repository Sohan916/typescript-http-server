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
  let body = "";

  req.on("data", (chunk) => {
    body += chunk;
  });

  req.on("end", () => {
    let errorResp = JSON.stringify({
      error: "Something went wrong",
    });

    try {
      const parsedBody = JSON.parse(body);
      res.header("Content-Type", "application/json");

      console.log(parsedBody);
      if (parsedBody.body.length > 140) {
        errorResp = JSON.stringify({
          error: "Chirp is too long",
        });
        res.status(400).send(errorResp);
      } else {
        const validResp = JSON.stringify({
          valid: true,
        });
        res.status(200).send(validResp);
      }
    } catch (error) {
      res.status(400).send(errorResp);
    }
  });
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

app.use("/admin/metrics", handleCounts);

app.post("/admin/reset", handleResetCount);

app.post("/api/validate_chirp", handleValidation);

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
