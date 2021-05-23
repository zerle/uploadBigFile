const http = require('http')
const path = require('path')
const fse = require('fs-extra')
const multiparty = require('multiparty')

const server = http.createServer()
const UPLOAD_DIR = path.resolve(__dirname, '..', 'target') // 大文件存储目录
// 提取后缀名
const extractExt = filename => filename.slice(filename.lastIndexOf('.'), filename.length)

server.on('request', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', '*')
  if (req.method === 'OPTIONS') {
    res.status = 200
    res.end()
    return false
  }
  await verify(req, res)
  upload(req, res)
  if (req.url === '/merge') {
    const data = await resolvePost(req)
    const { filename, hash } = data
    const filePath = `${UPLOAD_DIR}/${hash}${extractExt(filename)}`
    await mergeFileChunk(filePath, hash)
    res.end(
      JSON.stringify(
        {
          code: 0,
          message: 'file merged success'
        }
      )
    )
  }
})

function upload (req, res) {
  if (req.url === '/upload') {
    const multipart = new multiparty.Form()
    multipart.parse(req, async (err, fields, files) => {
      if (err) return false
      const [chunk] = files.chunk
      const [hash] = fields.hash
      const [fileHash] = fields.fileHash
      // const [filename] = fields.filename
      const chunkDir = `${UPLOAD_DIR}/${fileHash}`

      // 切片目录不存在，创建切片目录
      if (!fse.existsSync(chunkDir)) {
        await fse.mkdirs(chunkDir)
      }

      await fse.move(chunk.path, `${chunkDir}/${hash}`)
      setTimeout(() => {
        res.end('received file chunk')
      }, 3000)
    })
  }
}

async function verify (req, res) {
  if (req.url === '/verify') {
    const { fileHash, filename } = await resolvePost(req)
    const ext = extractExt(filename)
    const filePath = `${UPLOAD_DIR}/${fileHash}${ext}`
    if (fse.existsSync(filePath)) {
      res.end(
        JSON.stringify({
          shouldUpload: false
        })
      )
    } else {
      res.end(
        JSON.stringify({
          shouldUpload: true,
          uploadedList: await createUploadedList(fileHash)
        })
      )
    }
  }
}

function resolvePost (req) {
  return new Promise((resolve, reject) => {
    let chunk = ''
    req.on('data', data => {
      chunk += data
    })
    req.on('end', () => {
      resolve(JSON.parse(chunk))
    })
  })
}

async function mergeFileChunk (filePath, filename) {
  const chunkDir = `${UPLOAD_DIR}/${filename}`
  // const name = filename && filename.split('.')[0]
  // const targetDir = `${UPLOAD_DIR}/${name}`
  // if (!fse.existsSync(filePath)) {
  //   await fse.mkdirs(filePath)
  // }
  const chunkPaths = await fse.readdir(chunkDir)
  await fse.writeFile(filePath, '')
  chunkPaths.forEach(chunkPath => {
    const content = fse.readFileSync(`${chunkDir}/${chunkPath}`)
    fse.appendFileSync(filePath, content)
    fse.unlinkSync(`${chunkDir}/${chunkPath}`)
  })
  fse.rmdirSync(chunkDir) // 合并后删除保存切片的目录
}

// 返回已经上传切片名列表
async function createUploadedList (fileHash) {
  if (fse.existsSync(`${UPLOAD_DIR}/${fileHash}`)) {
    const results = await fse.readdir(`${UPLOAD_DIR}/${fileHash}`)
    return results
  } else {
    return []
  }
}

server.listen(3000, () => console.log('正在监听 3000 端口'))
