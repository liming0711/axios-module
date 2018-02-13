import axios from 'axios';
import qs from 'query-string';
import np from 'nprogress';
import 'nprogress/nprogress.css';

function checkStatus (response) {
  // 正常状态下，直接返回数据
  // 异常状态下，response 是 undefined，返回一个错误信息，
  // 如果没有错误信息，则返回自定义的错误信息
  if (response && response.status < 400) {
    return response;
  }

  return {
    data: response && response.data ? response.data : {},
    status: response && response.status ? response.status : -404,
    statusText: response && response.statusText ? response.statusText : '其他错误'
  };
}

function checkCode (response) {
  if (response.status >= 400 && response.status < 500) {
    response.statusText = '请求错误';
  } else if (response.status >= 500) {
    response.statusText = '服务器错误';
  }

  if (response.status >= 400 || response.status < 0) {
    console.error(`${response.statusText}，错误码：${response.status}`);
  }

  np.done();
  return response;
}

function httpRequest (request) {
  return request
    .then(response => {
      return checkStatus(response);
    })
    .then(response => {
      return checkCode(response);
    });
};

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
      transformRequest: [function (data, headers) {
        if (headers['Content-Type'] === 'application/x-www-form-urlencoded') {
          // 针对 application/x-www-form-urlencoded 对 data 进行序列化
          return qs.stringify(data);
        } else {
          return data;
        }
      }]
    };

    this.defaultConfig = {
      headers: defaultHeaders
    };

    this.$http = axios.create(Object.assign(defaultOptions, options));
    // request 拦截器
    this.$http.interceptors.request.use(
      config => {
        np.start();
        return config;
      },
      error => {
        return Promise.reject(error);
      });
    // response 拦截器
    this.$http.interceptors.response.use(
      response => {
        return response;
      },
      error => {
        // 将错误信息也以 resolve 的方式返回，并将错误信息进行处理，后面就不需要写 catch 了
        // 正常状态下，error.response 是错误信息
        // 网络异常的情况下，error.response 是 undefined
        return Promise.resolve(error.response);
      }
    );
  }

  get (url, config = {}) {
    return new Promise(resolve => {
      resolve(httpRequest(this.$http.get(url, resolveConfig('get', this.defaultConfig, config))));
    })
  }

  post (url, data = undefined, config = {}) {
    return new Promise(resolve => {
      resolve(httpRequest(this.$http.post(url, data, resolveConfig('post', this.defaultConfig, config))));
    });
  }

  put (url, data = undefined, config = {}) {
    return new Promise(resolve => {
      resolve(httpRequest(this.$http.put(url, data, resolveConfig('put', this.defaultConfig, config))));
    });
  }

  delete (url, config = {}) {
    return new Promise(resolve => {
      resolve(httpRequest(this.$http.delete(url, resolveConfig('delete', this.defaultConfig, config))));
    });
  }
}

// 导出工厂方法
export function createHttpClient (options, defaults) {
  return new HttpClientModule(options, defaults);
};

// 默认导出模块对象
export default HttpClientModule;
