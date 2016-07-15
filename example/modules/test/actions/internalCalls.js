'use strict'

module.exports = [
  {
    name: 'sumANumber',
    description: 'Sum two numbers',
    inputs: {
      a: {
        description: 'First number',
        required: true
      },
      b: {
        description: 'Second number',
        required: true
      }
    },

    run: (api, action, next) => {
      // make the sum calculation
      action.response.result = parseInt(action.params.a) + parseInt(action.params.b)

      // finish the action execution
      next()
    }
  },

  {
    name: 'formattedSum',
    description: 'Show a formatted sum response',
    inputs: {
      a: {
        description: 'First number',
        required: true
      },
      b: {
        description: 'Second number',
        required: true
      }
    },

    run: (api, action, next) => {
      // make a internal call to 'sumANumber' action
      api.actions.call('sumANumber', action.params, (error, response) => {
        // build a cool string
        action.response.formatted = `${action.params.a} + ${action.params.b} = ${response.result}`

        // finish the action execution
        next(error)
      })
    }
  }
]