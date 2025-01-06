import Fastify from "fastify";

const fastify = Fastify({ logger: true });

// Handle POST requests
fastify.post("/", async (request, reply) => {
  const { url } = request.body;

  if (!url) {
    throw new Error("No URL provided");
  }

  // Download video from R2
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download video: ${response.statusText}`);
  }

  const videoData = await response.arrayBuffer();

  // Write video data to temp file
  const fs = require("fs");
  const { execSync } = require("child_process");
  const path = require("path");
  const os = require("os");

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
  const { destination } = request.body;
  if (!destination) {
    throw new Error("No destination bucket URL provided");
  }

  // Upload each frame
  const uploadedFrames = await Promise.all(
    frames.map(async (frameData, index) => {
      const paddedIndex = String(index).padStart(2, "0");
      const frameUrl = `${destination}/out_${paddedIndex}.png`;

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
