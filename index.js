import csv from "csvtojson/v2/index.js";
import express from "express";
import cors from "cors";
import { config } from "dotenv";
import { createCanvas, loadImage } from "canvas";
import { promises as fs } from "fs";

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
    // const watermarkedImage = await applyWatermark(
    //   generatedImage,
    //   "hideous-gifts-logo.svg"
    // );
    return res.json({ url: generatedImage });
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
app.post("api/create-product", async (req,res)=>{
  try {
    const reqBody = req.body
    const variantInfoResponse = await fetch(`https://api.printify.com/v1/catalog/blueprints/${reqBody.blueprintId}/print_providers/${reqBody.providerId}/variants.json`,{
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiIzN2Q0YmQzMDM1ZmUxMWU5YTgwM2FiN2VlYjNjY2M5NyIsImp0aSI6ImRkMzYzZTkyOTcyMDgyMzFhN2M0OGZiZThhNzU4NDNiNTQ2MmJjMGJmODMzY2MyMzEyZjU1ZWMyNWY4OWQ0ZWFkNjUyMzlmY2RhYjg2MTY3IiwiaWF0IjoxNzE4MzU1MDY3LjM2Mzc2NSwibmJmIjoxNzE4MzU1MDY3LjM2Mzc2OSwiZXhwIjoxNzQ5ODkxMDY3LjM1NjQ4Niwic3ViIjoiMTcwNjQzMDAiLCJzY29wZXMiOlsic2hvcHMubWFuYWdlIiwic2hvcHMucmVhZCIsImNhdGFsb2cucmVhZCIsIm9yZGVycy5yZWFkIiwib3JkZXJzLndyaXRlIiwicHJvZHVjdHMucmVhZCIsInByb2R1Y3RzLndyaXRlIiwid2ViaG9va3MucmVhZCIsIndlYmhvb2tzLndyaXRlIiwidXBsb2Fkcy5yZWFkIiwidXBsb2Fkcy53cml0ZSIsInByaW50X3Byb3ZpZGVycy5yZWFkIl19.AjYSr4JB9O3ke7SiTNwwAaNsa2NPOA-1uKtWJ3yQXDQLwNuzUBxt7V4PpxcmHx1p3NbMzE7Brqz8ajLo6p8"
      }
    })
    const variantInfo = await variantInfoResponse.json()
    const imageUploadResponse = await fetch("https://api.printify.com/v1/uploads/images.json", {
      method:"POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        file_name: reqBody.fileName,
        url: reqBody.imageUrl
      })
    })
    const imageUpload = await imageUploadResponse.json()
    const createProductResponse = await fetch("https://api.printify.com/v1/shops/14354198/products.json", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        title: reqBody.productName,
        description: reqBody.productName,
        blueprint_id: reqBody.blueprintId,
        print_provider_id: reqBody.printProvider,
        variants:[
          variantInfo.variants.map((variant)=>(
            {
              id: variant.id,
              price: reqBody.price,
              is_enabled: true
            }
          ))
        ],
          print_areas: [
            {
              variant_ids: [
                variantInfo.variants.map((variant)=>(
                  variant.id
                ))
              ],
              placeholders: [
                reqBody.printAreas.map((area)=>(
                  {
                    position: area,
                    images: [
                        {
                          id: imageUpload.id, 
                          x: reqBody.x, 
                          y: reqBody.y, 
                          scale: reqBody.scale,
                          angle: 0,
                        }
                    ]
                  }
                ))
              ]
            }
          ]
      })
    })
    const createProduct = await createProductResponse.json()
    return res.json({
      data: createProduct
    })
  } catch (error) {
    return res.status(500).json({
      data: error.message
    })
  }
})

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
    const watermarkWidth = image.width * 0.1; // Scale the watermark to 10% of the image width
    const aspectRatio = svgImage.width / svgImage.height;
    const watermarkHeight = watermarkWidth / aspectRatio;

    // Calculate position: bottom-left corner
    const x = 5; // 5px padding from the left
    const y = image.height - watermarkHeight - 5; // 5px padding from the bottom

    // Draw the watermark onto the canvas
    ctx.drawImage(svgImage, x, y, watermarkWidth, watermarkHeight);

    // Export the final image as base64
    return canvas.toDataURL(); // Returns a base64 string (data:image/png;base64,...)
  } catch (error) {
    console.error("Error adding watermark:", error);
    throw error;
  }
}
