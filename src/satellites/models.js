import path from 'path'
import Utils from '../utils'
import mongoose from 'mongoose'

/**
 * Manage the models.
 */
class Models {

  /**
   * Reference for the API object.
   *
   * @type {null}
   */
  api = null

  /**
   * Mongoose object.
   *
   * @type {null}
   */
  mongoose = null

  /**
   * Connection status.
   *
   * @type {boolean}
   */
  connected = false

  /**
   * Hash with all registered models.
   *
   * @type {Map}
   */
  models = new Map()

  /**
   * Create a new Models call instance.
   *
   * @param api   API reference.
   */
  constructor (api) {
    this.api = api
  }

  /**
   * Open connection to MongoDB server.
   *
   * @param callback  Callback function.
   */
  openConnection (callback) {
    let self = this

    // if the connection has already open return and execute the callback
    if (self.status()) {
      callback(new Error('Connection is already open'))
      return
    }

    // check if we are use a mock version of the package
    if (self.api.config.models.pkg === 'mockgoose') {
      // require mockgoose
      let mockgoose = require('mockgoose')

      // wrap mongoose with mockgoose
      mockgoose(mongoose)

      // log an warning
      self.api.log('running with mockgoose', 'warning')
    }

    // save mongoose object
    self.mongoose = mongoose

    // open the new connection
    self.mongoose.connect(self.api.config.models.connectionString)

    // define handler for connected event
    self.mongoose.connection.on('connected', () => {
      self.api.log('connected to MongoDB', 'debug')
      self.connected = true
      callback()
    })

    // define handler for error event
    self.mongoose.connection.on('error', (err) => {
      self.api.log(`MongoDB Error: ${err}`, 'emerg')
    })

    // define handler for disconnected event
    self.mongoose.connection.on('disconnected', () => {
      self.connected = false
      self.api.log('MongoDB Connection Closed', 'debug')
    })
  }

  /**
   * Close connection.
   *
   * @param callback  Callback function.
   */
  closeConnection (callback) {
    let self = this

    // if there is not connection open return now
    if (!self.status()) {
      callback(new Error('There is no connection open'))
      return
    }

    self.mongoose.connection.close(callback)
  }

  /**
   * Return the connection status.
   *
   * @returns {boolean}
   */
  status () { return this.connected }

  /**
   * Add a new model.
   *
   * If the model already exists it will be replaced.
   *
   * @param name    Model name
   * @param schema  Model schema.
   */
  add (name, schema) { this.models.set(name, this.mongoose.model(name, schema)) }

  /**
   * Get a model object from the repository.
   *
   * @param modelName   model name to get.
   * @returns {V}       model object.
   */
  get (modelName) { return this.models.get(modelName) }

  /**
   * Remove a model from the repository.
   *
   * @param modelName   model name to be deleted.
   */
  remove (modelName) { this.models.delete(modelName) }

}

/**
 * Initializer for the models features.
 */
export default class {

  /**
   * Initializer load priority.
   *
   * @type {number}
   */
  static loadPriority = 100

  /**
   * Initializer start priority.
   *
   * @type {number}
   */
  static startPriority = 100

  /**
   * Initializer stop priority.
   *
   * @type {number}
   */
  static stopPriority = 400

  /**
   * Initializer loading function.
   *
   * @param api   API reference.
   * @param next  Callback function.
   */
  static load (api, next) {
    // expose models class on the engine
    api.models = new Models(api)

    // finish the initializer loading
    next()
  }

  /**
   * Initializer start function.
   *
   * @param api   API reference.
   * @param next  Callback function.
   */
  static start (api, next) {
    // open connection
    api.models.openConnection(() => {
      // read models files from the modules
      api.config.activeModules.forEach((moduleName) => {
        Utils.recursiveDirectoryGlob(`${api.scope.rootPath}/modules/${moduleName}/models`).forEach((moduleFile) => {
          // get file basename
          let basename = path.basename(moduleFile, '.js')

          // load the model
          api.models.add(basename, require(moduleFile).default)

          // log a message
          api.log(`model loaded: ${basename}`, 'debug')
        })
      })

      // finish the initializer start
      next()
    })
  }

  /**
   * Initializer stop function.
   *
   * @param api   API reference.
   * @param next  Callback function.
   */
  static stop (api, next) {
    // close connection
    api.models.closeConnection(next)
  }
}