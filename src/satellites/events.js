import async from 'async'
import Utils from '../utils'

/**
 * Class to manage events.
 *
 * The developers can use this to manipulate data during the
 * execution or to extend functionalities adding new behaviours
 * to existing logic. The listeners must be stored in
 * <moduleName>/listeners.
 */
class EventsManager {

  /**
   * API reference object.
   *
   * @type {null}
   */
  api = null

  /**
   * Map with all registered events and listeners.
   *
   * @type {Map}
   */
  events = new Map()

  /**
   * Create a new instance.
   *
   * @param api   API reference object.
   */
  constructor (api) { this.api = api }

  // -------------------------------------------------------------------------------------------------------- [Commands]

  /**
   * Fire an event.
   *
   * @param eventName   Event to fire.
   * @param data        Params to pass to the listeners.
   * @param callback    Callback function.
   */
  fire (eventName, data, callback = null) {
    let self = this

    // variable to store listener response data
    let responseData = data

    // check if exists listeners for this event
    if (self.events.has(eventName)) {
      // execute the listeners async in series
      async.each(self.events.get(eventName), (listener, callback) => listener.run(self.api, responseData, callback), () => {
        // execute the callback function
        if (typeof callback === 'function') { return callback(responseData) }
      })

      return
    }

    // execute the callback function
    if (typeof callback === 'function') { return callback(responseData) }
  }

  /**
   * Register a new listener for an event.
   *
   * Build the new listener object.
   *
   * @param event     Event name.
   * @param fn        Listener handler.
   * @param priority  Priority.
   */
  listener (event, fn, priority) {
    let self = this

    // build a listener object
    let listener = {
      event: event,
      run: fn,
      priority: priority
    }

    // insert the listener
    self._listenerObj(listener)
  }

  /**
   * Insert the listener object into the Map.
   *
   * The error messages are logged to the console, like warnings.
   *
   * @param listenerObj   Listener object.
   * @return boolean      True if is all okay, false otherwise.
   */
  _listenerObj (listenerObj) {
    let self = this

    // validate event name
    if (listenerObj.event === undefined) {
      self.api.log('invalid listener - missing event name', 'warning')
      return false
    }

    // validate run
    if (listenerObj.run === undefined || typeof listenerObj.run !== 'function') {
      self.api.log('invalid listener - missing run property or not a function', 'warning')
      return false
    }

    // if priority are not defined
    if (listenerObj.priority === undefined) { listenerObj.priority = self.api.config.general.defaultListenerPriority }

    // if there is no listener for this event, create a new entry
    // with an empty array
    if (!self.events.has(listenerObj.event)) { self.events.set(listenerObj.event, []) }

    // get the array with all registered listeners for this event
    let listeners = self.events.get(listenerObj.event)

    // register the new listener
    listeners.push(listenerObj)

    // order the listeners by priority
    listeners.sort((l1, l2) => l1.priority - l2.priority)

    return true
  }

  // --------------------------------------------------------------------------------------------------- [Other Methods]

  /**
   * Iterate over all active modules and
   *
   * @param next
   */
  loadListeners (next) {
    let self = this

    // iterate all active modules
    self.api.modules.modulesPaths.forEach(modulePath => {
      // build path for the module listeners folder
      let listenersFolderPath = `${modulePath}/listeners`

      // check if the listeners
      if (!Utils.directoryExists(listenersFolderPath)) { return }

      // get all listeners files
      Utils.recursiveDirectoryGlob(listenersFolderPath, 'js').forEach(listenerPath => {
        // require listener file
        let collection = require(listenerPath)

        for (let i in collection) {
          // get action object
          let listener = collection[ i ]

          // insert the listener on the map
          self._listenerObj(listener)
        }
      })
    })

    // end listeners loading
    next()
  }

}

/**
 * Satellite to load the event manager.
 */
export default class {

  /**
   * Satellite load priority.
   *
   * @type {number}
   */
  loadPriority = 300

  /**
   * Satellite loading function.
   *
   * @param api   API reference object.
   * @param next  Callback function.
   */
  load (api, next) {
    // make events api available in all platform
    api.events = new EventsManager(api)

    // load listeners
    api.events.loadListeners(next)
  }

}