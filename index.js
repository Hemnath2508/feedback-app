const express = require("express");
const cors = require("cors");
const path = require("path");
const { BlobServiceClient } = require("@azure/storage-blob");

const app = express();
app.use(express.json());
app.use(cors());

// Azure Storage
const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const containerName = "feedbacks";

// Serve frontend
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// 🔥 Feedback API
app.post("/feedback", async (req, res) => {
  try {
    const text = (req.body.text || "").trim();

    if (!text) {
      return res.status(400).json({ error: "Text is required" });
    }

    const positiveWords = ["good", "great", "excellent", "awesome", "nice"];
    const negativeWords = ["bad", "boring", "worst", "poor", "confusing"];

    let score = 0;

    positiveWords.forEach(w => {
      if (text.toLowerCase().includes(w)) score++;
    });

    negativeWords.forEach(w => {
      if (text.toLowerCase().includes(w)) score--;
    });

    let sentiment = "Neutral";
    if (score > 0) sentiment = "Positive";
    if (score < 0) sentiment = "Negative";

    const summary = text.split(" ").slice(0, 10).join(" ");

    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containerClient = blobServiceClient.getContainerClient(containerName);

    const blobName = `feedback-${Date.now()}.json`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    const data = JSON.stringify({
      text,
      sentiment,
      summary
    });

    // ✅ FIXED LINE
    await blockBlobClient.upload(data, Buffer.byteLength(data));

    res.json({ sentiment, summary });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// 🔥 History API
app.get("/history", async (req, res) => {
  try {
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containerClient = blobServiceClient.getContainerClient(containerName);

    const results = [];

    for await (const blob of containerClient.listBlobsFlat()) {
      const blobClient = containerClient.getBlobClient(blob.name);
      const response = await blobClient.download();
      const text = await streamToString(response.readableStreamBody);
      results.push(JSON.parse(text));
    }

    res.json(results.reverse());

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

// Helper
function streamToString(readableStream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readableStream.on("data", (d) => chunks.push(d.toString()));
    readableStream.on("end", () => resolve(chunks.join("")));
    readableStream.on("error", reject);
  });
}

// Start server
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port " + PORT);
});