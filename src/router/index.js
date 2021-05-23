import Vue from 'vue'
import Router from 'vue-router'
import UploadFile from '@/pages/UploadFile'

Vue.use(Router)

export default new Router({
  routes: [
    {
      path: '/',
      name: 'UploadFile',
      component: UploadFile
    }
  ]
})
