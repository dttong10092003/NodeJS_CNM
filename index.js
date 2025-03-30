require("dotenv").config();

const express = require("express");
const multer = require("multer");
const path = require("path");
const {
  DynamoDBClient,
  ScanCommand,
  PutItemCommand,
  DeleteItemCommand,
} = require("@aws-sdk/client-dynamodb");
const { marshall, unmarshall } = require("@aws-sdk/util-dynamodb");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { v4: uuid } = require("uuid");

const app = express();
const port = 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.static('./views'));
app.set('view engine', 'ejs');
app.set('views', './views');

// S3 setup
const s3 = new S3Client({
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Multer setup for file upload with memory storage
const storage = multer.memoryStorage();

// Check file type function to allow only image files
function checkFileType(file, cb) {
  const fileTypes = /jpeg|jpg|png|gif/; // Allowed image formats
  const extname = fileTypes.test(path.extname(file.originalname).toLowerCase()); // Check file extension
  const mimeType = fileTypes.test(file.mimetype); // Check MIME type

  if (extname && mimeType) {
    return cb(null, true); // File is valid
  }
  cb("Error: Only images are allowed!"); // If invalid file type
}

// Initialize multer with file type validation and size limit (2MB)
const upload = multer({
  storage: storage,
  limits: { fileSize: 2000000 }, // 2MB limit
  fileFilter: (req, file, cb) => {
    checkFileType(file, cb); // Apply file type check
  },
});

// DynamoDB setup
const client = new DynamoDBClient({
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});
const tableName = "ThanhTong";

// Home route to display products
app.get("/", async (req, res) => {
  try {
    const command = new ScanCommand({ TableName: tableName });
    const data = await client.send(command);
    const sanPhams = data.Items.map((item) => unmarshall(item));
    res.render("index", { sanPhams });
  } catch (err) {
    console.error("Lỗi đọc DynamoDB:", err);
    res.status(500).send("Internal Server Error");
  }
});

// Add product route
app.post("/", upload.single("image"), async (req, res) => {
  const { ma_sp, ten_sp, so_luong } = req.body;
  const file = req.file;

  // Check if file is uploaded
  if (!file) {
    return res.status(400).send("No file uploaded");
  }

  // Generate unique file name and upload to S3
  const fileName = `${uuid()}-${file.originalname}`;
  const filePath = `uploads/${fileName}`;

  const uploadParams = {
    Bucket: process.env.AWS_S3_BUCKET_NAME, // S3 bucket name
    Key: filePath,
    Body: file.buffer,
    ContentType: file.mimetype,
  };

  s3.send(new PutObjectCommand(uploadParams), (error, data) => {
    if (error) {
      console.log("Error uploading image:", error);
      return res.send("Internal Server Error");
    } else {
      // Construct item data with CloudFront URL
      const newItem = {
        TableName: tableName,
        Item: marshall({
          ma_sp: Number(ma_sp),
          ten_sp,
          so_luong: Number(so_luong),
          image_url: `${process.env.AWS_CLOUDFRONT_URL}/${filePath}`, // CloudFront URL
        }),
      };

      // Store item in DynamoDB
      client.send(new PutItemCommand(newItem), (err, data) => {
        if (err) {
          console.log("Error saving to DynamoDB:", err);
          return res.send("Internal Server Error");
        } else {
          return res.redirect("/");
        }
      });
    }
  });
});

// Delete products
app.post("/delete", upload.none(), async (req, res) => {
  const listItems = Object.keys(req.body);

  if (listItems.length === 0) return res.redirect("/");

  async function onDeleteItem(index) {
    if (index < 0) return res.redirect("/");
    const ma_sp = listItems[index];
    try {
      const command = new DeleteItemCommand({
        TableName: tableName,
        Key: marshall({ ma_sp: Number(ma_sp) }),
      });
      await client.send(command);
      onDeleteItem(index - 1);
    } catch (err) {
      console.error("Lỗi xoá sản phẩm:", err);
      res.status(500).send("Internal Server Error");
    }
  }

  onDeleteItem(listItems.length - 1);
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});