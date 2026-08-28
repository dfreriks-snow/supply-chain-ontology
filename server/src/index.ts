import "dotenv/config";
import express from "express";
import cors from "cors";
import { apiRouter } from "./routes/api.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "4mb" }));
app.use(apiRouter);

const PORT = Number(process.env.PORT) || 3009;
app.listen(PORT, () => {
  console.log(`Supply Chain Ontology API listening on http://localhost:${PORT}`);
});
