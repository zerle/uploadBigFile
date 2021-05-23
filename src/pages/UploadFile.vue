<template>
  <div>
    <input type="file"
           @change="handleFileChange">
    <button @click="handleUpload">上传</button>
    <button @click="handlePause" v-if="isPaused">暂停</button>
    <button @click="handleResume" v-else>恢复</button>
    <div>{{fakeUploadPercentage + '%'}}</div>
    <span>计算文件hash:</span>
    <div>{{hashPercentage + '%'}}</div>
    <span>总进度:</span>
    <div>{{uploadPercentage + '%'}}</div>
    <div v-for="(item, index) in container.data" :key="index">
      <div>{{item.hash}}</div>
      <div>{{item.percentage + '%'}}</div>
    </div>
  </div>
</template>
<script>
import Worker from '../public/hash.worker'
const LENGTH = 10
export default {
  name: 'UploadFile',
  data () {
    return {
      container: {
        file: null,
        data: [],
        worker: {}
      },
      fakeUploadPercentage: 0,
      hashPercentage: 0,
      requestList: [],
      isPaused: true
    }
  },
  methods: {
    handleFileChange (e) {
      const [file] = e.target.files
      if (!file) return
      this.container.file = file
    },

    // 文件上传
    async handleUpload () {
      if (!this.container.file) return
      const fileChunkList = this.createFileChunk(this.container.file)
      this.container.hash = await this.calculateHash(fileChunkList)
      const { shouldUpload, uploadedList } = await this.verifyUpload(
        this.container.file.name,
        this.container.hash
      )
      if (!shouldUpload) {
        alert('秒传: 上传成功')
        return false
      }
      this.container.data = fileChunkList.map(({file, size}, index) => ({
        fileHash: this.container.hash,
        chunk: file,
        index,
        percentage: uploadedList.includes(index) ? 100 : 0,
        size,
        // hash: this.container.file.name + '-' + index, // 文件名 + 数组下标
        hash: this.container.hash + '-' + index // 文件名 + 数组下标
      }))
      await this.uploadChunks(uploadedList)
      // await this.mergeRequest()
    },

    // 简单封装ajax请求
    request ({
      url,
      method = 'post',
      data,
      headers = {},
      onProgress = e => e,
      requestList
    }) {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.upload.onprogress = onProgress
        xhr.open(method, url)
        Object.keys(headers).forEach(key => {
          xhr.setRequestHeader(key, headers[key])
        })
        xhr.send(data)
        xhr.onload = e => {
          if (requestList) {
            const xhrIndex = requestList.findIndex(item => item === xhr)
            requestList.splice(xhrIndex, 1)
          }
          resolve({
            data: e.target.response
          })
        }
        requestList && requestList.push(xhr)
      })
    },

    // 生成文件切片
    createFileChunk (file, length = LENGTH) {
      const fileChunkList = []
      const chunkSize = Math.ceil(file.size / length)
      let cur = 0
      while (cur < file.size) {
        fileChunkList.push({
          file: file.slice(cur, cur + chunkSize),
          size: chunkSize
        })
        cur += chunkSize
      }
      return fileChunkList
    },

    // 上传切片
    async uploadChunks (uploadedList = []) {
      const requestList = this.container.data
        .filter(({ hash }) => !uploadedList.includes(hash))
        .map(({chunk, hash, fileHash}) => {
          const formData = new FormData()
          formData.append('chunk', chunk)
          formData.append('hash', hash)
          formData.append('fileHash', fileHash)
          formData.append('filename', this.container.file.name)
          return {formData}
        })
        .map(async ({formData}, index) => {
          this.request({
            url: 'http://localhost:3000/upload',
            data: formData,
            onProgress: this.createProgressHandler(this.container.data[index]),
            requestList: this.requestList
          })
        })
      // 并发切片
      await Promise.all(requestList)
      // 之前上传的切片数量 + 本次上传的切片数量 = 所有切片数量时
      // 合并切片
      if (uploadedList.length + requestList.length === this.container.data.length) {
        await this.mergeRequest()
      }
    },

    // 合并切片
    async mergeRequest () {
      await this.request({
        url: 'http://localhost:3000/merge',
        headers: {
          'content-type': 'application/json'
        },
        data: JSON.stringify({
          filename: this.container.file.name,
          hash: this.container.hash
        })
      })
    },

    createProgressHandler (item) {
      return e => {
        item.percentage = parseInt(String((e.loaded / e.total) * 100))
      }
    },

    // 生成文件 hash (web-worker)
    calculateHash (fileChunkList) {
      return new Promise(resolve => {
        // 添加 worker 属性
        this.container.worker = new Worker()
        this.container.worker.postMessage({ fileChunkList })
        this.container.worker.onmessage = e => {
          const { percentage, hash } = e.data
          this.hashPercentage = percentage
          if (hash) resolve(hash)
        }
      })
    },
    // 文件秒传
    async verifyUpload (filename, fileHash) {
      const { data } = await this.request({
        url: 'http://localhost:3000/verify',
        headers: {
          'content-type': 'application/json'
        },
        data: JSON.stringify({
          filename,
          fileHash
        })
      })
      return JSON.parse(data)
    },

    // 暂停上传
    handlePause () {
      this.requestList.forEach(xhr => xhr && xhr.abort())
      this.requestList = []
      this.isPaused = false
    },
    // 恢复上传
    async handleResume () {
      const { uploadedList } = await this.verifyUpload(
        this.container.file.name,
        this.container.hash
      )
      await this.uploadChunks(uploadedList)
    }
  },
  computed: {
    uploadPercentage () {
      if (!this.container.file || !this.container.data.length) return 0
      const loaded = this.container.data
        .map(item => item.size * item.percentage)
        .reduce((acc, cur) => acc + cur)
      return parseInt((loaded / this.container.file.size).toFixed(2))
    }
  },
  watch: {
    uploadPercentage (now) {
      if (now > this.fakeUploadPercentage) {
        this.fakeUploadPercentage = now
      }
    }
  }
}
</script>
