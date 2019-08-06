process.env.REACT_APP_SIGNALHUB_URLS = 'localhost:8080'
const { REACT_APP_SIGNALHUB_URLS } = process.env

import * as common from 'masq-common'
import signalhub from 'signalhubws'
import swarm from 'webrtc-swarm'

const { expect } = require('chai')
const Masq = require('../src/lib/masq').default
const SyncProfile = require('../src/lib/sync-profile').default

const { dbExists } = common.utils
const { genAESKey, exportKey } = common.crypto

const waitForSync = async (db1, db2) => {
  return new Promise((resolve) => {
    const checkVersion = () => {
      db1.version((err, latestVersion) => {
        if (err) { throw err }
        db2.version((err, currentVersion) => {
          if (err) { throw err }
          if (currentVersion.toString('hex') === latestVersion.toString('hex')) {
            return resolve()
          }
        })
      })
    }

    db1.watch('/', () => {
      checkVersion()
    })

    db2.watch('/', () => {
      checkVersion()
    })

    checkVersion()
  })
}

describe('sync-profile', function () {
  this.timeout(30000)

  before(async () => {
    this.cryptoKey = await genAESKey(true, 'AES-GCM', 128)
    this.key = await exportKey(this.cryptoKey)
    this.keyBase64 = Buffer.from(this.key).toString('base64')
  })

  after(() => {
    window.localStorage.clear()
  })

  it('should join the secure channel', async () => {
    const sp = new SyncProfile({ hubUrl: REACT_APP_SIGNALHUB_URLS })
    const hub = signalhub('channel', REACT_APP_SIGNALHUB_URLS)
    const sw = swarm(hub)

    const join = new Promise((resolve) => {
      sw.on('close', () => resolve())
      sw.on('peer', () => sw.close())
      sp.joinSecureChannel('channel', this.keyBase64)
    })

    await join
  })

  it('should sync the profile', async () => {
    const sp1 = new SyncProfile({ hubUrl: REACT_APP_SIGNALHUB_URLS })
    const sp2 = new SyncProfile({ hubUrl: REACT_APP_SIGNALHUB_URLS })
    const masq = new Masq()
    const masq2 = new Masq('-copy')
    const profile = {
      firstname: '',
      lastname: '',
      username: 'username',
      image: '',
      password: 'pass'
    }

    const app = {
      name: 'myapp',
      description: 'description of the app',
      appId: 'id'
    }

    const { id } = await masq.addProfile(profile)
    const idCopy = id + '-copy'
    const publicProfile = {
      ...(await masq.getProfiles())[0],
      id: idCopy
    }

    const privateProfile = await masq.openProfile(id, 'pass')

    // we need to save a device
    await masq.addApp(app)
    await masq._createDBAndSyncApp('app')

    const devicesBeforeSync = await masq.getDevices()
    expect(devicesBeforeSync).to.have.lengthOf(1)
    expect(window.localStorage).to.have.lengthOf(1)
    expect(masq.profileDB._authorized).to.have.lengthOf(1)

    await Promise.all([
      sp1.joinSecureChannel('channel-sync', this.keyBase64),
      sp2.joinSecureChannel('channel-sync', this.keyBase64)
    ])

    await Promise.all([
      sp2.pushProfile(masq.profileDB, idCopy, publicProfile),
      sp1.pullProfile('pass')
    ])

    expect(window.localStorage).to.have.lengthOf(2)
    expect(await dbExists('profile-' + id)).to.be.true
    expect(await dbExists('profile-' + idCopy)).to.be.true
    // The two databases should be authorized
    expect(masq.profileDB._authorized).to.have.lengthOf(2)
    const localStorageProfile = window.localStorage.getItem('profile-' + idCopy)
    expect(JSON.parse(localStorageProfile)).to.eql(publicProfile)

    const syncedProfile = await masq2.openProfile(idCopy, 'pass')
    expect(syncedProfile).to.eql(privateProfile)

    // 2 devices should exist from now
    expect(await masq2.getDevices()).to.have.lengthOf(2)

    await waitForSync(masq.profileDB, masq2.profileDB)
    // masq1 should also see the new device
    const devices = await masq.getDevices()

    expect(devices).to.have.lengthOf(2)
    expect(devices[0]).to.haveOwnProperty('localKey')
    expect(devices[1]).to.haveOwnProperty('localKey')
    expect(devices[0].localKey).to.have.lengthOf(64)
    expect(devices[1].localKey).to.have.lengthOf(64)
    expect(devices[0].localKey).to.not.equal(devices[1].localKey)

    let device1 = await masq.getDevice()
    expect(device1.apps).to.have.lengthOf(1)
    expect(device1.apps[0].id).to.exist
    expect(device1.apps[0].key).to.have.lengthOf(64)
    expect(device1.apps[0].localKey).to.have.lengthOf(64)
    expect(device1.apps[0].localKey).to.equal(device1.apps[0].key)

    expect(masq.appsDBs[device1.apps[0].id]).to.exist
    expect(masq.appsDBs[device1.apps[0].id]._authorized).to.have.lengthOf(1)

    // await sp2.pullApps(masq2, '-copy')
    await new Promise((resolve) => { setTimeout(resolve, 5000) })

    let device2 = await masq2.getDevice()
    expect(device2.apps).to.have.lengthOf(1)
    expect(device2.apps[0].id).to.exist
    expect(device2.apps[0].key).to.have.lengthOf(64)
    expect(device2.apps[0].localKey).to.have.lengthOf(64)
    expect(device2.apps[0].localKey).to.not.equal(device2.apps[0].key)

    expect(masq2.appsDBs[device2.apps[0].id]).to.exist

    await new Promise((resolve) => { setTimeout(resolve, 5000) })

    const appid = device1.apps[0].id
    expect(masq.appsDBs[appid]._authorized).to.have.lengthOf(2)
    expect(masq2.appsDBs[appid + '-copy']._authorized).to.have.lengthOf(2)

    await masq2._createDBAndSyncApp('app2')

    await new Promise((resolve) => { setTimeout(resolve, 5000) })

    device1 = await masq.getDevice()
    device2 = await masq2.getDevice()
    expect(device1.apps).to.have.lengthOf(2)
    expect(device2.apps).to.have.lengthOf(2)

    await new Promise((resolve) => { setTimeout(resolve, 5000) })

    expect(masq.appsDBs['app2' + '-copy']._authorized).to.have.lengthOf(2)
    expect(masq2.appsDBs['app2']._authorized).to.have.lengthOf(2)
  })
})
