import express, { type Request, type Response } from "express";

const handleReadiness = (req: Request, res: Response) => {
  res.set("Content-Type", "text/plain");
  res.status(200).send("OK");
};

const app = express();
const PORT = 8080;

app.use("/app", express.static("./src/app"));

app.get("/healthz", handleReadiness);

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
