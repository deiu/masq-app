import React, { Fragment } from 'react'
import PropTypes from 'prop-types'
import { connect } from 'react-redux'
import { CheckCircle, Slash } from 'react-feather'

import { Modal, Button, Loader, Card, Typography, Space } from '../../components'
import { handleUserAppLogin, handleUserAppRegister, setCurrentAppRequest, fetchApps } from '../../actions'

import styles from './AuthApp.module.scss'

class AuthApp extends React.Component {
  constructor (props) {
    super(props)
    this.state = {
      refused: false
    }
    this.handleOk = this.handleOk.bind(this)
    this.handleAccept = this.handleAccept.bind(this)
    this.handleRefuse = this.handleRefuse.bind(this)
    this.handleRefuseConfirm = this.handleRefuseConfirm.bind(this)
  }

  async componentDidMount () {
    const { channel, key, appId } = this.props.appRequest
    await this.props.handleUserAppLogin(channel, key, appId)
  }

  async componentDidUpdate (prevProps) {
    if (prevProps.appRequest.channel === this.props.appRequest.channel) {
      return
    }

    // Another appRequest has been received
    const { channel, key, appId } = this.props.appRequest
    await this.props.handleUserAppLogin(channel, key, appId)
  }

  async handleRefuse () {
    this.setState({ refused: true })
  }

  async handleRefuseConfirm () {
    await this.props.handleUserAppRegister(false)
    await this.props.setCurrentAppRequest(null)
    this.props.onClose()
  }

  async handleAccept () {
    await this.props.handleUserAppRegister(true)
    await this.props.fetchApps() // The apps may be added
  }

  async handleOk () {
    // remove the app request
    await this.props.setCurrentAppRequest(null)
  }

  renderButtons () {
    const { appRequest } = this.props
    const { refused } = this.state

    if (refused) {
      return (
        <Button color='neutral' onClick={this.handleRefuseConfirm}>Fermer</Button>
      )
    }

    if (appRequest.isConnected === false) {
      return (
        <Fragment>
          <Button onClick={this.handleRefuse} color='danger'>Refuser</Button>
          <Button onClick={this.handleAccept} color='success'>Valider</Button>
        </Fragment>
      )
    }

    if (appRequest.isConnected) {
      return <Button onClick={this.handleOk}>Ok</Button>
    }

    return <Loader />
  }

  renderText () {
    const { appRequest } = this.props
    const { refused } = this.state

    if (refused) {
      return (
        <div>
          <Slash size={114} color={styles.colorGreyLight} />
          <Space size={28} />
          <Typography type='paragraph-modal' align='center'>Vous avez refusé l'accès de l'application {appRequest.appId} à votre stockage Masq.</Typography>
        </div>
      )
    }

    if (appRequest.isConnected === undefined) return false

    if (appRequest.isConnected === false) {
      return (
        <div>
          <Typography type='paragraph-modal'>
            Cette application demande un accès à votre stockage Masq.
            Si vous n’êtes pas à l’origine de cette demande veuillez refuser cette requête.
          </Typography>
          <Space size={30} />
          <Card minHeight={64} title={appRequest.name} image={appRequest.imageURL} color={styles.colorPurple} description={appRequest.description} />
        </div>
      )
    } else {
      return (
        <div>
          <CheckCircle size={114} color={styles.colorSuccess} />
          <Space size={28} />
          <Typography type='paragraph-modal' align='center'>Vous avez autorisé l'application {appRequest.appId} à accéder à votre stockage Masq.</Typography>
          <Typography type='paragraph-modal' align='center'>Vous pouvez désormais utiliser l'application.</Typography>
        </div>
      )
    }
  }

  getTitle () {
    if (this.state.refused) {
      return 'Nouvelle requête de connexion refusée'
    }

    if (this.props.appRequest.isConnected === undefined) return false

    return this.props.appRequest.isConnected
      ? 'Nouvelle requête de connexion acceptée'
      : 'Nouvelle requête de connexion'
  }

  render () {
    return (
      <Modal width={511}>
        <div className={styles.AuthApp}>
          <Typography type='title-modal'>{this.getTitle()}</Typography>
          <Space size={32} />
          {this.renderText()}
          <div className={styles.buttons}>
            {this.renderButtons()}
          </div>
        </div>
      </Modal>
    )
  }
}

AuthApp.propTypes = {
  handleUserAppRegister: PropTypes.func.isRequired,
  handleUserAppLogin: PropTypes.func.isRequired,
  setCurrentAppRequest: PropTypes.func.isRequired,
  fetchApps: PropTypes.func.isRequired,
  appRequest: PropTypes.object.isRequired,
  onClose: PropTypes.func
}

const mapStateToProps = state => ({
  currentUser: state.masq.currentUser
})

const mapDispatchToProps = (dispatch) => ({
  handleUserAppLogin: (channel, key, appId) => dispatch(handleUserAppLogin(channel, key, appId)),
  handleUserAppRegister: (isAccepted) => dispatch(handleUserAppRegister(isAccepted)),
  setCurrentAppRequest: (app) => dispatch(setCurrentAppRequest(app)),
  fetchApps: () => dispatch(fetchApps())
})

export default connect(mapStateToProps, mapDispatchToProps)(AuthApp)
