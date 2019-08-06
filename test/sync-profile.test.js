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
    const masq2 = new Masq()
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

    console.log('test', id)

    // need to save deviceId
    await masq.addDevice({ name: 'test' })

    await masq.addApp(app)
    await masq._createDBAndSyncApp('app')

    // const devices = await masq.getDevices()
    // expect(devices).to.have.lengthOf(2)

    expect(window.localStorage).to.have.lengthOf(1)
    expect(masq.profileDB._authorized).to.have.lengthOf(1)

    await Promise.all([
      sp1.joinSecureChannel('channel2', this.keyBase64),
      sp2.joinSecureChannel('channel2', this.keyBase64)
    ])

    await Promise.all([
      sp2.pushProfile(masq.profileDB, idCopy, publicProfile),
      sp1.pullProfile('pass')
    ])

    expect(await dbExists('profile-' + id)).to.be.true
    expect(await dbExists('profile-' + idCopy)).to.be.true

    expect(masq.profileDB._authorized).to.have.lengthOf(2)
    expect(window.localStorage).to.have.lengthOf(2)
    const localStorageProfile = window.localStorage.getItem('profile-' + idCopy)
    expect(JSON.parse(localStorageProfile)).to.eql(publicProfile)

    const syncedProfile = await masq2.openProfile(idCopy, 'pass')
    expect(syncedProfile).to.eql(privateProfile)

    const devices = await masq.getDevices()
    console.log(devices)
    expect(devices).to.have.lengthOf(2)

    sp2.pullApps(masq2)
  })

  // it('should pull apps', async () => {

  // })
})
