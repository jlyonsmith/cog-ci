export { DB } from "./DB"
export { MS } from "./MS"
export { MQ } from "./MQ"

import stream from "stream"
import pino from "pino"
import * as pinoExpress from "pino-pretty-express"
import path from "path"
import fs from "fs"
import config from "config"

export const isProduction = process.env.NODE_ENV === "production"

export function streamToBuffer(readable) {
  return new Promise((resolve, reject) => {
    var chunks = []
    var writeable = new stream.Writable()

    writeable._write = function(chunk, enc, done) {
      chunks.push(chunk)
      done()
    }

    readable.on("end", function() {
      resolve(Buffer.concat(chunks))
    })

    readable.on("error", (err) => {
      reject(err)
    })

    readable.pipe(writeable)
  })
}

export function pipeToPromise(readable, writeable) {
  const promise = new Promise((resolve, reject) => {
    readable.on("error", (error) => {
      reject(error)
    })
    writeable.on("error", (error) => {
      reject(error)
    })
    writeable.on("finish", (file) => {
      resolve(file)
    })
  })
  readable.pipe(writeable)
  return promise
}

export async function gridFSToFile(db, assetId, filePath) {
  // Pull gridfs asset from database and write to a file
  const writeable = fs.createWriteStream(filePath)
  const readable = db.gridfs.openDownloadStream(assetId)
  await pipeToPromise(readable, writeable)
}

export async function fileToGridFS(
  filePath,
  db,
  assetId,
  contentType,
  metadata
) {
  const readable = fs.createReadStream(filePath)
  const writeable = db.gridfs.openUploadStreamWithId(
    assetId,
    assetId.toString() + path.extname(filePath),
    {
      contentType,
      metadata,
    }
  )

  await pipeToPromise(readable, writeable)
}

export function getLog(serviceName) {
  let log = null

  if (isProduction) {
    log = pino(
      { name: serviceName },
      fs.createWriteStream(
        path.join(config.get("logDir"), serviceName + ".log")
      )
    )
  } else {
    const pretty = pinoExpress.pretty({})
    pretty.pipe(process.stdout)
    log = pino({ name: serviceName }, pretty)
  }

  return log
}

export function removeNulls(object) {
  var isArray = object instanceof Array
  for (var k in object) {
    if (object[k] === null) {
      isArray ? object.splice(k, 1) : delete object[k]
    } else if (typeof object[k] == "object") {
      removeNulls(object[k])
    }
  }
  return object
}
