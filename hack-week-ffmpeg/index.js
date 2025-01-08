import Fastify from "fastify";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "child_process";
import os from "os";
import { v4 as uuidv4 } from "uuid";

const fastify = Fastify({ logger: true });

// Handle POST requests
fastify.post("/", async (request, reply) => {
  const { url } = request.query;

  if (!url) {
    throw new Error("No URL provided");
  }

  // Download video from R2
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download video: ${response.statusText}`);
  }

  const videoData = await response.arrayBuffer();
  // Create temp directory and files
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "video-"));
  const inputPath = path.join(tempDir, "input.mp4");
  const outputDir = path.join(tempDir, "frames");

  // Write video data to temp file
  fs.writeFileSync(inputPath, Buffer.from(videoData));

  // Run frame-it script
  execSync(`./frame-it.sh "${inputPath}" "${outputDir}"`);

  // Read generated frames
  const frames = fs
    .readdirSync(outputDir)
    .filter((f) => f.endsWith(".png"))
    .map((f) => {
      const framePath = path.join(outputDir, f);
      const frameData = fs.readFileSync(framePath);
      return frameData;
    });

  // Cleanup temp files
  fs.rmSync(tempDir, { recursive: true, force: true });

  // Upload frames to R2 bucket
  const { bucketPath } = request.query;
  const framePath = bucketPath || uuidv4();
  // if (!destination) {
  //   throw new Error("No destination bucket URL provided");
  // }

  let destination =
    "https://hack-week-ts.mike-test-ent-account.workers.dev/frames";

  // Upload each frame

  const uploadedFrames = await Promise.all(
    frames.map(async (frameData, index) => {
      const finalUpload = index === frames.length - 1;

      const paddedIndex = String(index).padStart(2, "0");
      const frameFileName = `out_${paddedIndex}.png`;
      const frameKey = `${framePath}/${frameFileName}`;
      const frameUrl = `${destination}?bucketPath=${frameKey}&finalUpload=${finalUpload}&basePath=${framePath}`;

      const uploadResponse = await fetch(frameUrl, {
        method: "PUT",
        body: frameData,
        headers: {
          "Content-Type": "image/png",
        },
      });

      if (!uploadResponse.ok) {
        throw new Error(
          `Failed to upload frame ${index}: ${uploadResponse.statusText}`
        );
      }

      return frameUrl;
    })
  );

  return {
    message: "Video downloaded successfully",
    size: videoData.byteLength,
  };
});

// Default GET response
fastify.get("/", async () => {
  return "FFMPEG Service Running\n";
});

const start = async () => {
  try {
    const PORT = process.env.PORT || 3000;
    console.log("Starting server...");
    await fastify.listen({
      port: PORT,
      host: "0.0.0.0",
    });
    console.log(`Server running on port ${PORT}`);
  } catch (err) {
    console.error("Failed to start server:", err);
    fastify.log.error(err);
    process.exit(1);
  }
};

console.log("Initializing application...");
start();
