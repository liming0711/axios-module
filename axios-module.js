import axios from 'axios';
import qs from 'qs';

const TIMEOUT = 10000;

function isEmptyObject (obj) {
  return !obj || !Object.keys(obj).length;
}

// 清理headers中不需要的属性
function clearUpHeaders (headers) {
  [
    'common',
    'get',
    'post',
    'put',
    'delete',
    'patch',
    'options',
    'head'
  ].forEach(prop => headers[prop] && delete headers[prop]);
  return headers;
}

// 组合请求方法的headers
// headers = default <= common <= method <= extra
function resolveHeaders (method, defaults = {}, extras = {}) {
  method = method && method.toLowerCase();
  // check method参数的合法性
  if (!/^(get|post|put|delete|patch|options|head)$/.test(method)) {
    throw new Error(`method:${method}不是合法的请求方法`);
  }

  const headers = defaults;
  const commonHeaders = headers.common || {};
  const headersForMethod = headers[method] || {};
  return clearUpHeaders(Object.assign(headers, commonHeaders, headersForMethod, extras));
}

// 组合请求方法的config
// config = default <= extra
function resolveConfig (method, defaults = {}, extras = {}) {
  if (isEmptyObject(defaults) && isEmptyObject(extras)) {
    return {};
  }
  return Object.assign(defaults, extras, resolveHeaders(method, defaults.headers, extras.headers));
}

class HttpClientModule {
  constructor (options = {}) {
    const defaultHeaders = options.headers || {};
    if (options.headers) {
      delete options.headers;
    }

    const defaultOptions = {
      timeout: TIMEOUT,
      // transformRequest 最后一个函数必须返回一个字符串，或 Buffer, ArrayBuffer, FormData, Stream 之一的实例
      transformRequest: [(data, headers) => {
        if (headers['Content-Type'] === 'application/x-www-form-urlencoded') {
          // 针对application/x-www-form-urlencoded对data进行序列化
          return qs.stringify(data);
        }
        return JSON.stringify(data);
      }]
    };

    this.defaultConfig = {
      headers: Object.assign({
        'Content-Type': 'application/json;charset=UTF-8'
      }, defaultHeaders)
    }

    this.$http = axios.create(Object.assign(defaultOptions, options));
    // request 拦截器
    this.$http.interceptors.request.use(
      config => {
        return config;
      },
      error => {
        console.error(error);
        return Promise.reject(error);
      });

    // response 拦截器，重新请求功能
    this.$http.interceptors.response.use(
      response => {
        return response;
      },
      error => {
        var config = error.config;
        // 如果无法获取 config 或者 config 里没有 retry 参数，则直接返回 reject
        if(!config || !config.retry) {
          return Promise.reject(error);
        }
        
        // 设置一个参数来统计 retry 的次数
        config.__retryCount = config.__retryCount || 0;
        
        // 如果 retry 次数达到了最大值还没有请求成功，则直接返回 reject
        if(config.__retryCount >= config.retry) {
          return Promise.reject(error);
        }
        
        // 增加 retry 的次数
        config.__retryCount += 1;

        // 初始化一个 retry 的时间间隔，默认为 20ms
        let retryDelay = config.retryDelay || 20;
        
        // 创建一个 Promise 来处理 retry 的延迟
        var backoff = new Promise(resolve => {
          setTimeout(() => {
            resolve();
          }, retryDelay);
        });
        
        // 返回一个重新尝试请求的 Promise
        return backoff.then(() => {
          return this.$http(config);
        });
      });
  }

  get (url, config = {}) {
    return new Promise(resolve => {
      resolve(this.$http.get(url, resolveConfig('get', this.defaultConfig, config)));
    })
  }

  post (url, data = undefined, config = {}) {
    return new Promise(resolve => {
      resolve(this.$http.post(url, data, resolveConfig('post', this.defaultConfig, config)));
    });
  }

  put (url, data = undefined, config = {}) {
    return new Promise(resolve => {
      resolve(this.$http.put(url, data, resolveConfig('put', this.defaultConfig, config)));
    });
  }

  delete (url, config = {}) {
    return new Promise(resolve => {
      resolve(this.$http.delete(url, resolveConfig('delete', this.defaultConfig, config)));
    });
  }
}

// 导出工厂方法
export function createHttpClient (options) {
  return new HttpClientModule(options);
};

// 默认导出模块对象
export default HttpClientModule;
