// Can't use ES2015 style import/export in here because Babel is not used to compile

var raw = require("config/raw").raw
var consul = require("consul")({ promisify: true })
var flat = require("flat")

const consulRoot = "cog/config"

function getConsulConfig(name) {
  const key = `${consulRoot}/${process.env.NODE_ENV || "development"}/${name}`
  const afterKeyIndex = key.length + 1
  return new Promise((resolve, reject) => {
    consul.kv
      .get({
        key,
        recurse: true,
      })
      .then((res) => {
        if (res) {
          resolve(
            flat.unflatten(
              Object.assign(
                {},
                ...res.map((i) => ({
                  [i.Key.substr(afterKeyIndex)]: i.Value,
                }))
              ),
              { delimiter: "/" }
            )
          )
        } else {
          reject(new Error(`Consul key '${key}' is not present`))
        }
      })
      .catch((error) => {
        reject(error)
      })
  })
}

module.exports = {
  uri: raw(getConsulConfig("uri")),
}
