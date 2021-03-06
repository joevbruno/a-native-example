#!/usr/bin/env node

var exec = require('child_process').exec
var spawn = require('child_process').spawn
var path = require('path')
var tar = require('tar-fs')
var crypto = require('crypto')
var request = require('request')
var zlib = require('zlib')

var WINDOWS = process.platform === 'win32'
var SERVER = 'nodejs-prebuilds.s3.eu-central-1.amazonaws.com'

if (SERVER.indexOf('://') === -1) SERVER = 'http://' + SERVER // no need for https, content addressed

build(false, function (err, buf, name) {
  if (err) process.exit(1)
  if (process.platform !== 'linux') return upload(buf, name)
  build(true, function (err, buf, name) {
    if (err) process.exit(1)
    upload(buf, name)
  })
})

function upload (buf, name) {
  var url = SERVER + '/' + name
  request.put(url, {body: buf}, function (err, res) {
    if (err) {
      console.error(err.message)
      process.exit(1)
    }
    if (!/2\d\d/.test(res.statusCode)) {
      console.error('Bad status code:', res.statusCode)
      process.exit(2)
    }

    console.log('###############################################')
    console.log()
    console.log('PREBUILD WAS SUCCESFUL: ' + url)
    console.log()
    console.log('###############################################')
  })
}

function build (ia32, cb) {
  shouldRelease(function (err, version) {
    if (err) return cb(err)
    if (!version) return cb(null, null)

    if (ia32) process.env.ARCH = 'ia32'

    spawn(WINDOWS ? 'npm.cmd' : 'npm',  ['run', 'prebuild'], {stdio: 'inherit'}).on('exit', function (code) {
      if (code) return cb(new Error('Build failed'))

      var stream = tar.pack(path.join(__dirname, 'prebuilds'))
      var bufs = []

      stream.on('readable', function () {
        var data
        while ((data = stream.read())) {
          bufs.push(data)
        }
      })

      stream.on('end', function () {
        zlib.gzip(Buffer.concat(bufs), function (err, buf) {
          if (err) return cb(err)
          var hash = crypto.createHash('sha256').update(buf).digest('hex')
          cb(null, buf, hash + '.sha256.tar.gz')
        })
      })
    })
  })
}


function shouldRelease (cb) {
  return cb(null, true)

  getPackageVersion('HEAD', function (err, head) {
    if (err) return cb(err)
    getPackageVersion('HEAD~1', function (err, oldHead) {
      if (err) return cb(err)
      if (head === oldHead) return cb(null, null)
      // cb(null, head)
    })
  })
}

function getPackageVersion (rev, cb) {
  exec('git show ' + rev + ':package.json', {
    encoding: 'utf8'
  }, function (err, diff) {
    cb(err, diff && JSON.parse(diff).version)
  })
}
