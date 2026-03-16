const express = require("express");
const axios = require("axios");
const app = express();
app.use(express.json());

app.post("/ingest", async (req, res) => {
  try {
    // Forwarding to the Python 'Brain' [cite: 87]
    const response = await axios.post(
      "http://localhost:8000/analyze",
      req.body,
    );
    console.log("--- New Transaction Processed ---");
    console.log("Data:", req.body);
    console.log("AI Analysis:", response.data);

    res.json({ success: true, analysis: response.data });
  } catch (err) {
    res.status(500).json({ error: "AI Layer Offline" });
  }
});

app.listen(3001, () => console.log("Orchestrator online on Port 3001"));
