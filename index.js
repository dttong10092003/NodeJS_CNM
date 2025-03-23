require('dotenv').config();  

const express = require('express');
const multer = require('multer');
const { DynamoDBClient, ScanCommand, PutItemCommand, DeleteItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');

const app = express();
const port = 3000;
const upload = multer();

app.use(express.urlencoded({ extended: true }));
app.use(express.static('./views'));
app.set('view engine', 'ejs');
app.set('views', './views');

// Sử dụng biến môi trường từ .env
const client = new DynamoDBClient({
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID, 
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY, 
  },
});

const tableName = 'ThanhTong';

// Trang chủ: Hiển thị danh sách
app.get('/', async (req, res) => {
  try {
    const command = new ScanCommand({ TableName: tableName });
    const data = await client.send(command);
    const sanPhams = data.Items.map(item => unmarshall(item));
    res.render('index', { sanPhams });
  } catch (err) {
    console.error('Lỗi đọc DynamoDB:', err);
    res.status(500).send('Internal Server Error');
  }
});

// Thêm sản phẩm
app.post('/', upload.none(), async (req, res) => {
  const { ma_sp, ten_sp, so_luong } = req.body;

  const item = {
    ma_sp: Number(ma_sp),
    ten_sp,
    so_luong: Number(so_luong),
  };

  try {
    const command = new PutItemCommand({
      TableName: tableName,
      Item: marshall(item),
    });
    await client.send(command);
    res.redirect('/');
  } catch (err) {
    console.error('Lỗi ghi DynamoDB:', err);
    res.status(500).send('Internal Server Error');
  }
});

// Xoá nhiều sản phẩm
app.post('/delete', upload.fields([]), async (req, res) => {
  const listItems = Object.keys(req.body);

  if (listItems.length === 0) return res.redirect('/');

  async function onDeleteItem(index) {
    if (index < 0) return res.redirect('/');
    const ma_sp = listItems[index];
    try {
      const command = new DeleteItemCommand({
        TableName: tableName,
        Key: marshall({ ma_sp: Number(ma_sp) }),
      });
      await client.send(command);
      onDeleteItem(index - 1);
    } catch (err) {
      console.error('Lỗi xoá sản phẩm:', err);
      res.status(500).send('Internal Server Error');
    }
  }

  onDeleteItem(listItems.length - 1);
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
