module.exports = {

  promiseGet: (db, path) => {
    return new Promise((resolve, reject) => {
      db.get(path, (err, node) => {
        if (err) return reject(err)
        return resolve(node)
      })
    })
  },

  promiseBatch: (db, batch) => {
    return new Promise((resolve, reject) => {
      db.batch(batch, (err) => {
        if (err) return reject(err)
        return resolve()
      })
    })
  },

  promisePut: (db, path, obj) => {
    return new Promise((resolve, reject) => {
      db.put(path, obj, (err) => {
        if (err) return reject(err)
        return resolve()
      })
    })
  }

}