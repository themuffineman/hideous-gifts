import { createCanvas, loadImage } from "canvas";
import { promises as fs } from "fs";

async function applyWatermark(imageUrl, watermarkPath) {
  try {
    // Load the main image from the hosted URL and the watermark SVG locally
    const [image, watermark] = await Promise.all([
      loadImage(imageUrl),
      fs.readFile(watermarkPath, "utf8"), // Read the SVG file
    ]);

    // Create a canvas and set its dimensions to the image's dimensions
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext("2d");

    // Draw the main image onto the canvas
    ctx.drawImage(image, 0, 0, image.width, image.height);

    // Create a temporary canvas for the watermark
    const svgImage = await loadImage(
      `data:image/svg+xml;base64,${Buffer.from(watermark).toString("base64")}`
    );
    const watermarkWidth = image.width * 0.5; // Scale the watermark to 50% of the image width
    const aspectRatio = svgImage.width / svgImage.height;
    const watermarkHeight = watermarkWidth / aspectRatio;

    // Calculate position: bottom-left corner
    const x = 10; // 10px padding from the left
    const y = image.height - watermarkHeight - 10; // 10px padding from the bottom

    // Draw the watermark onto the canvas
    ctx.drawImage(svgImage, x, y, watermarkWidth, watermarkHeight);

    // Export the final image as base64
    return canvas.toDataURL(); // Returns a base64 string (data:image/png;base64,...)
  } catch (error) {
    console.error("Error adding watermark:", error);
    throw error;
  }
}

(async () => {
  const base64 = await applyWatermark(
    "https://images.pexels.com/photos/27914301/pexels-photo-27914301/free-photo-of-reflexion-urbana.jpeg",
    "hideous-gifts-logo.svg"
  );
  console.log(base64);
})();
