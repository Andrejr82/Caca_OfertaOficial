const cloudinary = require('cloudinary').v2;

// 1. Configure Cloudinary
cloudinary.config({ 
  cloud_name: 'dr8uatjpf', 
  api_key: '894941329519158', 
  api_secret: 'QKsaJ28tctoibE0g3Wl29CgZ1ag' 
});

async function run() {
  try {
    console.log("Uploading image...");
    
    // 2. Upload an image
    const uploadResult = await cloudinary.uploader.upload('https://res.cloudinary.com/demo/image/upload/sample.jpg', {
      public_id: 'my_first_uploaded_sample'
    });
    console.log("Upload Secure URL:", uploadResult.secure_url);
    console.log("Public ID:", uploadResult.public_id);

    // 3. Get image details
    console.log("\nImage Metadata:");
    console.log(`Width: ${uploadResult.width}px`);
    console.log(`Height: ${uploadResult.height}px`);
    console.log(`Format: ${uploadResult.format}`);
    console.log(`File size: ${uploadResult.bytes} bytes`);

    // 4. Transform the image
    // f_auto: Automatically converts the image format to the most optimal one for the requesting browser
    // q_auto: Automatically adjusts the image quality to balance file size and visual fidelity
    const transformedUrl = cloudinary.url(uploadResult.public_id, {
      fetch_format: 'auto',
      quality: 'auto'
    });

    console.log("\nDone! Click link below to see optimized version of the image. Check the size and the format.");
    console.log("Transformed URL:", transformedUrl);

  } catch (error) {
    console.error("Error running script:", error);
  }
}

run();
