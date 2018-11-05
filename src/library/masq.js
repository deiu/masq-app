const rai = require('random-access-idb')
const signalhub = require('signalhubws')
const hyperdb = require('hyperdb')
const swarm = require('webrtc-swarm')
const pump = require('pump')
const uuidv4 = require('uuid/v4')

const HUB_URLS = ['localhost:8080']

const openOrCreateDB = (name) => {
  return hyperdb(rai(name), {
    valueEncoding: 'json',
    firstNode: true
  })
}

// Replicate a db indefinitely
const replicateDB = db => {
  const discoveryKey = db.discoveryKey.toString('hex')
  const hub = signalhub(discoveryKey, HUB_URLS)
  const sw = swarm(hub)

  sw.on('peer', peer => {
    const stream = db.replicate({ live: true })
    pump(peer, stream, peer)
  })
}

class Masq {
  constructor () {
    this.dbs = {
      core: null,
      profiles: null
    }
  }

  /**
   * Initialize Masq: Open core and profiles databases
   */
  init () {
    return new Promise((resolve, reject) => {
      let readyCount = 0

      // create or open core and profiles databases
      this.dbs.core = openOrCreateDB('masq-core')
      this.dbs.profiles = openOrCreateDB('masq-profiles')

      // Sync
      Object.values(this.dbs).forEach(db => {
        db.on('ready', () => {
          replicateDB(db)
          if (++readyCount === 2) return resolve()
        })
      })
    })
  }

  // Add a new profile to the core and profiles databases
  addProfile (user) {
    return new Promise((resolve, reject) => {
      this.dbs.core.get('/profiles', (err, node) => {
        if (err) return reject(err)

        const ids = node ? node.value : []
        const id = uuidv4()
        user['id'] = id
        const batch = [{
          type: 'put',
          key: '/profiles',
          value: [...ids, id]
        }, {
          type: 'put',
          key: `/profiles/${id}`,
          value: user
        }]

        this.dbs.core.batch(batch, (err) => {
          if (err) return reject(err)
          resolve()
        })
      })
    })
  }

  // get private profiles from core db
  getProfiles () {
    return new Promise((resolve, reject) => {
      this.dbs.core.get('/profiles', (err, node) => {
        if (err) return reject(err)
        if (!node) return resolve([])

        const ids = node.value
        const profiles = []

        for (let id of ids) {
          this.dbs.core.get(`/profiles/${id}`, (err, node) => {
            profiles.push(node.value)
            if (err) return reject(err)
            if (ids.length === profiles.length) return resolve(profiles)
          })
        }
      })
    })
  }

  updateProfile (profile) {
    const id = profile.id
    if (!id) throw Error('Missing id')

    return new Promise((resolve, reject) => {
      this.dbs.core.put(`/profiles/${id}`, profile, (err) => {
        if (err) return reject(err)
        return resolve()
      })
    })
  }

  // getApps () {
  //   return new Promise((resolve, reject) => {
  //     this.dbs.core.get('apps', (err, nodes) => {
  //       if (err) return reject(err)

  //       if (nodes[0]) {
  //         return resolve(nodes[0].value)
  //       }
  //     })
  //   })
  // }

  // SWARM to authorize new apps
  // joinSwarm (channel, app) {
  //   this.hub = signalhub(channel, ['localhost:8080'])
  //   this.sw = swarm(this.hub)

  //   this.sw.on('peer', (peer, id) => {
  //     peer.on('data', data => this.handleData(data, peer, app))
  //   })

  //   this.sw.on('disconnect', (peer, id) => {
  //     console.log(`peer ${id} disconnected.`)
  //   })
  // }

  // 1) App requests a new db
  // 2) Masq instantiate a db, start replicating, and send the key needed to READ the db to the app
  // 3) The app starts to replicate, then sends its key to authorize it as a WRITER.
  // handleData (data, peer, app) {
  //   let json = null
  //   try {
  //     json = JSON.parse(data)
  //   } catch (e) {
  //     console.error(e)
  //     return
  //   }

  //   const cmd = json.cmd
  //   // const app = json.app

  //   if (cmd === 'requestDB') {
  //     this.createAppDB(app, (err, db) => {
  //       if (err) return console.error(err)
  //       peer.send(JSON.stringify({
  //         cmd: 'key',
  //         key: db.key.toString('hex')
  //       }))
  //     })
  //     return
  //   }

  //   if (cmd === 'key') {
  //     return this.authorize(json.key, peer, app)
  //   }
  // }

  // authorize (key, peer, app) {
  //   this.dbs[app].authorize(Buffer.from(key), err => {
  //     if (err) return console.error(err)
  //     peer.send(JSON.stringify({ cmd: 'success' }))
  //   })
  // }

  // createApp (app, channel) {
  //   this.joinSwarm(channel, app)
  // }

  // createAppDB (name, cb) {
  //   if (this.dbs[name]) {
  //     // app DB is already shared
  //     return cb(null, this.dbs[name])
  //   }

  //   const db = hyperdb(rai(name), { valueEncoding: 'json' })

  //   this.dbs[name] = db
  //   this.dbs.core.put('apps', [name])
  //   // this.setState({ apps: [...this.state.apps, name] })
  //   db.on('ready', () => {
  //     replicateDB(db)
  //     cb(null, db)
  //   })
  // }
}

module.exports = Masq
