const module = 'order'
// initial state
// https://developers.e-com.plus/docs/api/#/store/orders
const state = {
  body: {
    _id: null,
    number: null,
    status: null,
    fulfillment_status: {},
    financial_status: {},
    items: [],
    transactions: [],
    shipping_lines: [],
    amount: {},
    payment_method_label: null,
    shipping_method_label: null
  }
}

const mutations = {
  // reset order body object
  editOrder (state, { body }) {
    state.body = {
      ...state.body,
      ...body
    }
  },

  // setup order ID
  setOrderId (state, id) {
    state.body._id = id
  }
}

const getters = {
  order: state => state.body,

  // returns the first transaction object if any
  orderTransaction: state => state.body.transactions[0],

  // map current order financial status
  orderFinancialStatus ({ body }) {
    let status = body.financial_status.current
    if (status) {
      return status
    } else {
      // check on transaction object
      let transaction = body.transactions[0]
      if (transaction && transaction.status) {
        return transaction.status.current
      }
    }
    // default status: pending payment
    return 'pending'
  },

  // map current order fulfillment status
  orderFulfillmentStatus ({ body }) {
    let status = body.fulfillment_status.current
    if (status) {
      return status
    } else {
      // check on shipping line object
      let shippingLine = body.shipping_lines[0]
      if (shippingLine && shippingLine.status) {
        return shippingLine.status.current
      }
    }
    return null
  },

  // check if order shipping line still with pending delivery
  shippingDeliveryPending: state => shipping => {
    if (shipping.status) {
      switch (shipping.status.current) {
        case 'delivered':
        case 'returned_for_exchange':
        case 'received_for_exchange':
        case 'returned':
          return false
      }
    }
    return true
  },

  // returns delivery estimate date with order shipping line deadlines
  shippingDeliveryDate: state => shipping => {
    // base date is when order was paid
    let paymentsHistory = state.body.payments_history
    if (paymentsHistory) {
      let records = paymentsHistory.find(({ status }) => status === 'paid')
      if (records.length) {
        let dateString
        // get the last status update timestamp
        records.forEach(record => {
          if (!dateString || dateString < record.date_time) {
            dateString = record.date_time
          }
        })

        // mount date object to return
        let date = new Date(dateString)
        let addDays = deadline => {
          let days = deadline.days
          if (deadline.working_days) {
            // get day of week as a number
            let dow = date.getDay()
            // also count weekend days
            // https://gist.github.com/psdtohtml5/7000529
            days += ((dow === 6 ? 2 : +!dow) + (Math.floor((days - 1 + (dow % 6 || 1)) / 5) * 2))
          }
          date.setDate(date.getDate() + days)
        }

        if (!shipping.status || shipping.status.current !== 'shipped') {
          // add posting deadline
          if (shipping.posting_deadline) {
            addDays(shipping.posting_deadline)
          }
        }
        if (shipping.delivery_time) {
          // add delivery time
          addDays(shipping.delivery_time)
        }
        return date
      }
    }
    // unexpedted current payment status or shipping status
    return new Date()
  }
}

const actions = {
  // save new order object
  saveOrder ({ dispatch, commit, rootGetters }, payload) {
    if (rootGetters.customerEmail) {
      // customer logged
      // call mutation to setup state
      commit('setOrderId', payload._id)
      // read full order object from Store API and save
      return dispatch('init', { module }, { root: true })
    } else {
      // save the received payload only
      commit('editOrder', { body: payload })
      return Promise.resolve(payload)
    }
  },

  // update order data on background
  updateOrder ({ state, commit, dispatch, rootGetters }) {
    // read order object from Store API and save again
    let background = true
    if (rootGetters.customerEmail) {
      // authenticated request with customer logged
      dispatch('init', { module, background }, { root: true })
    } else {
      // get only the public order data
      let apiArgs = [ 'get', 'orderInfo', state.body._id, background ]
      dispatch('api', apiArgs, { root: true }).then(body => {
        // update state of order object
        commit('editOrder', { body })
      })
    }
  }
}

export default {
  state,
  getters,
  mutations,
  actions
}
