import csv from "csvtojson/v2/index.js";
import FormData from "form-data";
import express from "express";
import cors from "cors";
import { config } from "dotenv";
import { createCanvas, loadImage } from "canvas";
import { promises as fs } from "fs";
import ImageKit from "imagekit";

config();
const app = express();
app.listen(8080, () => console.log("listening on 8080"));
app.use(
  cors({
    origin: "*",
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const authenticate = (req, res, next) => {
  const apiKey = req.header("x-api-key");
  if (apiKey && apiKey === process.env.SERVER_API_KEY) {
    next();
  } else {
    res.status(401).json({ message: "Unauthorized" });
  }
};
app.use("/api/generate-image", authenticate);
app.use("/api/upscale-image", authenticate);
app.use("/api/get-countries", authenticate);
app.use("/api/text2image", authenticate);

app.post("/api/generate-image", async (req, res) => {
  let isImageDone = false;
  let generatedImage;
  try {
    const { uploadedImage, targetImage } = req.body;
    console.log("Received Request:", uploadedImage, targetImage);

    const apiResponse = await fetch(
      "https://api.imagepipeline.io/faceswap/v1",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "API-Key": process.env.API_KEY,
        },
        body: JSON.stringify({
          input_face: uploadedImage,
          input_image: targetImage,
        }),
      }
    );

    if (!apiResponse.ok) {
      const error = await apiResponse.json();
      console.log(error);
      throw Error("Failed to create image");
    }

    const resBody = await apiResponse.json();
    console.log("Image Created: ", resBody.id);

    while (isImageDone !== true) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const generatedRes = await fetch(
        `https://api.imagepipeline.io/faceswap/v1/status/${resBody.id}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "API-Key": process.env.API_KEY,
          },
        }
      );
      if (!generatedRes.ok) {
        const resError = await generatedRes.json();
        console.log(resError);
        throw Error(`Failed to poll`);
      }
      const pollingRes = await generatedRes.json();
      console.log("Polling Status:", pollingRes.status);
      if (pollingRes.status === "SUCCESS") {
        generatedImage = pollingRes.download_urls[0];
        isImageDone = true;
        console.log("Polling Success:", generatedImage);
      } else if (pollingRes.status === "FAILURE") {
        isImageDone = true;
        throw new Error(`Failure to generate image: ${pollingRes?.error}`);
      }
    }
    if (Array.isArray(generatedImage)) {
      generatedImage = generatedImage[0];
      console.log("New gen iamge:", generatedImage);
    }
    const watermarkedImage = await applyWatermark(
      generatedImage,
      "hideous-gifts-logo.svg"
    );

    return res.json({
      previewUrl: watermarkedImage,
      productUrl: generatedImage,
    });
  } catch (err) {
    console.error(err.message);
    return res.status(500).json({ error: err.message });
  }
});
app.post("/api/upscale-image", async (req, res) => {
  let isImageDone = false;
  let upscaledImage;
  try {
    const { image } = req.body;

    const apiResponse = await fetch(
      "https://api.imagepipeline.io/superresolution/v1",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "API-Key": process.env.API_KEY,
        },
        body: JSON.stringify({
          model_name: "RealESRGAN_x4plus",
          init_image: image,
          scale_factor: 4,
          tile: 150,
        }),
      }
    );

    if (!apiResponse.ok) {
      throw Error("Failed to upscale image");
    }

    const { id } = await apiResponse.json();
    console.log("Upscale Id: ", id);

    while (isImageDone !== true) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const generatedRes = await fetch(
        `https://api.imagepipeline.io/superresolution/v1/status/${id}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "API-Key": process.env.API_KEY,
          },
        }
      );
      if (!generatedRes.ok) {
        const resError = await generatedRes.json();
        console.log(resError);
        throw Error("Failed to poll");
      }
      const pollingRes = await generatedRes.json();
      console.log("Polling Status:", pollingRes.status);
      if (pollingRes.status === "SUCCESS") {
        upscaledImage = pollingRes.download_urls[0];
        isImageDone = true;
        console.log("Polling Success:", upscaledImage);
      }
    }

    return res.json({ url: upscaledImage }).status(200);
  } catch (err) {
    console.error(err.message);
    return res.json({ error: err }).status(500);
  }
});
app.get("/api/keep-alive", async (req, res) => {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  res.send("Server Alive");
});
app.get("/api/get-countries", async (req, res) => {
  console.log("Received Countries Request");
  const csvFilePath = "./countryList.csv";
  const jsonArray = await csv().fromFile(csvFilePath);
  res.json(jsonArray);
});
app.post("/api/text2image", async (req, res) => {
  let isImageDone = false;
  let generatedImage;
  try {
    const { prompt } = req.body;
    console.log("Received Request:", prompt);

    const apiResponse = await fetch(
      "https://api.imagepipeline.io/sdxl/text2image/v1",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "API-Key": process.env.API_KEY,
        },
        body: JSON.stringify({
          prompt: prompt,
          model_id: process.env.MODEL_ID,
          negative_prompt: process.env.NEGATIVE_PROMPT,
          num_inference_step: Number(process.env.NUM_INFERENCE_STEP),
          samples: Number(process.env.SAMPLES),
          guidance_scale: Number(process.env.GUIDANCE_SCALE),
          width: Number(process.env.WIDTH),
          height: Number(process.env.HEIGHT),
          lora_models: [process.env.LORA_MODELS],
          lora_weights: [Number(process.env.LORA_WEIGHTS)],
          scheduler: process.env.SCHEDULER,
          seed: Number(process.env.SEED),
          clip_skip: Number(process.env.CLIP_SKIP),
          safety_checker: process.env.SAFETY_CHECKER === "true", // Boolean conversion
          ip_adapter_image: process.env.IP_ADAPTER_IMAGE,
          ip_adapter: [process.env.IP_ADAPTER],
          ip_adapter_scale: [Number(process.env.IP_ADAPTER_SCALE)],
          webhook: process.env.WEBHOOK,
        }),
      }
    );

    if (!apiResponse.ok) {
      const error = await apiResponse.json();
      console.log(error);
      throw Error("Failed to create image");
    }

    const resBody = await apiResponse.json();
    console.log("Image Created: ", resBody.id);

    while (isImageDone !== true) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const generatedRes = await fetch(
        `https://api.imagepipeline.io/sd/text2image/v1/status/${resBody.id}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "API-Key": process.env.API_KEY,
          },
        }
      );
      if (!generatedRes.ok) {
        const resError = await generatedRes.json();
        console.log(resError);
        throw Error(`Failed to poll`);
      }
      const pollingRes = await generatedRes.json();
      console.log("Polling Status:", pollingRes.status);
      if (pollingRes.status === "SUCCESS") {
        generatedImage = pollingRes.download_urls;
        isImageDone = true;
        console.log("Polling Success:", generatedImage);
      } else if (pollingRes.status === "FAILURE") {
        isImageDone = true;
        throw new Error(`Failure to generate image: ${pollingRes?.error}`);
      }
    }

    return res.json({ url: generatedImage });
  } catch (err) {
    console.error(err.message);
    return res.status(500).json({ error: err.message });
  }
});
app.post("/api/create-product", async (req, res) => {
  try {
    const reqBody = req.body;
    const variantInfoResponse = await fetch(
      `https://api.printify.com/v1/catalog/blueprints/${reqBody.blueprintId}/print_providers/${reqBody.providerId}/variants.json`,
      {
        method: "GET",
        headers: {
          Authorization: reqBody.token,
        },
      }
    );
    const variantInfo = await variantInfoResponse.json();
    const imageUploadResponse = await fetch(
      "https://api.printify.com/v1/uploads/images.json",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: reqBody.token,
        },
        body: JSON.stringify({
          file_name: reqBody.fileName,
          url: reqBody.imageUrl,
        }),
      }
    );
    const imageUpload = await imageUploadResponse.json();

    const createProductResponse = await fetch(
      "https://api.printify.com/v1/shops/14354198/products.json",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: reqBody.token,
        },
        body: JSON.stringify({
          title: reqBody.productName,
          description: reqBody.productName,
          blueprint_id: reqBody.blueprintId,
          print_provider_id: reqBody.providerId,
          variants: variantInfo.variants.map((variant) => {
            return {
              id: variant.id,
              price: reqBody.price,
              // is_enabled: true,
            };
          }),
          print_areas: [
            {
              variant_ids: variantInfo.variants.map((variant) => {
                return variant.id;
              }),
              placeholders: reqBody.printAreas.map((area) => {
                if (area !== "front") {
                  return {
                    position: area,
                    images: [
                      {
                        id: "6751df108e4ed254fc7d1019",
                        x: reqBody.x,
                        y: reqBody.y,
                        scale: reqBody.scale,
                        angle: 0,
                      },
                    ],
                  };
                } else {
                  return {
                    position: area,
                    images: [
                      {
                        id: imageUpload.id,
                        x: reqBody.x,
                        y: reqBody.y,
                        scale: reqBody.scale,
                        angle: 0,
                      },
                    ],
                  };
                }
              }),
            },
          ],
        }),
      }
    );
    const productResponse = await createProductResponse.json();
    console.log("Product res: ", productResponse);
    return res.json({
      images: productResponse.images,
      variants: productResponse.variants,
      id: productResponse.id,
    });
  } catch (error) {
    return res.status(500).json({
      data: error.message,
    });
  }
});
app.post("/api/create-product-2", async (req, res) => {
  try {
    const reqBody = req.body;
    const variantInfoResponse = await fetch(
      `https://api.printify.com/v1/catalog/blueprints/${reqBody.blueprintId}/print_providers/${reqBody.providerId}/variants.json`,
      {
        method: "GET",
        headers: {
          Authorization: reqBody.token,
        },
      }
    );
    const variantInfo = await variantInfoResponse.json();
    const imageUploadResponse = await fetch(
      "https://api.printify.com/v1/uploads/images.json",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: reqBody.token,
        },
        body: JSON.stringify({
          file_name: reqBody.fileName,
          url: reqBody.imageUrl,
        }),
      }
    );
    const imageUpload = await imageUploadResponse.json();

    const createProductResponse = await fetch(
      "https://api.printify.com/v1/shops/14354198/products.json",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: reqBody.token,
        },
        body: JSON.stringify({
          title: reqBody.productName,
          description: reqBody.productName,
          blueprint_id: reqBody.blueprintId,
          print_provider_id: reqBody.providerId,
          variants: reqBody.price,
          print_areas: [
            {
              variant_ids: variantInfo.variants.map((variant) => {
                return variant.id;
              }),
              placeholders: reqBody.printAreas.map((area) => {
                if (area !== "front") {
                  return {
                    position: area,
                    images: [
                      {
                        id: "6751df108e4ed254fc7d1019",
                        x: reqBody.x,
                        y: reqBody.y,
                        scale: reqBody.scale,
                        angle: 0,
                      },
                    ],
                  };
                } else {
                  return {
                    position: area,
                    images: [
                      {
                        id: imageUpload.id,
                        x: reqBody.x,
                        y: reqBody.y,
                        scale: reqBody.scale,
                        angle: 0,
                      },
                    ],
                  };
                }
              }),
            },
          ],
        }),
      }
    );
    const { images, variants, id } = await createProductResponse.json();
    return res.json({
      images,
      variants,
      id,
    });
  } catch (error) {
    return res.status(500).json({
      data: error.message,
    });
  }
});
app.post("/api/calculate-shipping", async (req, res) => {
  try {
    const reqBody = req.body;
    console.log("calculating shipping...");
    const printifyRes = await fetch(
      "https://api.printify.com/v1/shops/14354198/orders/shipping.json",
      {
        method: "POST",
        body: JSON.stringify(reqBody),
        headers: {
          "Content-Type": "application/json",
          Authorization: req.headers.authorization,
        },
      }
    );
    const printifyResBody = await printifyRes.json();
    console.log("Shipping Response: ", printifyResBody);
    return res.json(printifyResBody);
  } catch (err) {
    console.error("Error calculating shipping: ", err.message);
    return res.sendStatus(500);
  }
});
async function applyWatermark(imageUrl, watermarkPath, watermarkOpacity = 0.5) {
  try {
    // Initialize ImageKit instance
    const imagekit = new ImageKit({
      publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
      privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
      urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
    });

    // Load the main image and watermark SVG
    const [image, watermark] = await Promise.all([
      loadImage(imageUrl),
      fs.readFile(watermarkPath, "utf8"), // Read SVG as a string
    ]);

    // Create a canvas with the dimensions of the main image
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext("2d");

    // Draw the main image onto the canvas
    ctx.drawImage(image, 0, 0, image.width, image.height);

    // Load the watermark SVG as an image
    const svgImage = await loadImage(
      `data:image/svg+xml;base64,${Buffer.from(watermark).toString("base64")}`
    );

    // Calculate size of each watermark (scale to 40% of the image width)
    const watermarkWidth = image.width * 0.3; // Adjust as needed
    const aspectRatio = svgImage.width / svgImage.height;
    const watermarkHeight = watermarkWidth / aspectRatio;

    // Set watermark transparency
    ctx.globalAlpha = watermarkOpacity;

    // Scatter the watermark with fewer instances (e.g., only 2 per row/column)
    const horizontalSpacing = image.width / 4; // Divide image width into two segments
    const verticalSpacing = image.height / 4; // Divide image height into two segments
    for (let y = 0; y < image.height; y += verticalSpacing) {
      for (let x = 0; x < image.width; x += horizontalSpacing) {
        ctx.drawImage(svgImage, x, y, watermarkWidth, watermarkHeight);
      }
    }

    // Reset transparency
    ctx.globalAlpha = 1.0;

    // Export the final image as a buffer
    const buffer = canvas.toBuffer("image/png");
    // Date for the filename
    const filenameDate = new Date();
    // Upload the image to ImageKit
    const result = await imagekit.upload({
      file: buffer, // The final image as a buffer
      fileName: `hg-watermarked-image-${filenameDate.getTime()}-${filenameDate.getDate()}-${filenameDate.getMonth()}-${filenameDate.getFullYear()}.png`, // Name of the file
    });

    console.log("Image uploaded successfully:", result.url);
    return result.url; // Return the URL of the uploaded image
  } catch (error) {
    console.error("Error adding watermark:", error.message);
    throw error;
  }
}
