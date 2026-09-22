import { statusCodes } from '~/src/server/common/constants/status-codes.js'
import 'dotenv/config'
import { config } from '~/src/config/config.js'
import { createApiHeadersForGrantsUiBackend } from '../auth/backend-auth-helper.js'
import { log, LogCodes } from '../logging/log.js'
import { createBoomError } from '../errors.js'

const GRANTS_UI_BACKEND_ENDPOINT = config.get('session.cache.apiEndpoint')

/**
 * Logging function for API errors
 * @param {LogCodeEntry} [logCode] - The log code entry to bind the returned logger to
 * @returns {(request: AnyRequest, messageOptions?: Record<string, unknown>) => void} A logger bound to the given log code
 */
function logApiError(logCode = LogCodes.SYSTEM.EXTERNAL_API_ERROR) {
  /**
   * Logs API errors with the specified log code
   * @param {AnyRequest} request - The request object
   * @param {Record<string, unknown>} messageOptions - Additional message options
   */
  return (request, messageOptions = {}) => log(logCode, messageOptions, request)
}

/**
 * Fetches the current value of a feature control from grants-ui-backend.
 *
 * Feature controls are broadcast into grants-ui-backend via the config-broker's
 * FIFO SQS flow; this is a live read of whatever value grants-ui-backend
 * currently holds, with no local caching.
 *
 * @param {string} key - The feature-control key, e.g. `application-window-open:{grantCode}`
 * @param {AnyRequest} request - The request object
 * @returns {Promise<boolean|null>} The current value, or `null` on 404 / unconfigured backend
 */
export async function getFeatureControlValue(key, request) {
  const logDebug = logApiError(LogCodes.SYSTEM.EXTERNAL_API_CALL_DEBUG)
  const logError = logApiError()

  if (!GRANTS_UI_BACKEND_ENDPOINT?.length) {
    return null
  }

  const method = 'GET'
  const endpoint = new URL(`/feature-controls/${encodeURIComponent(key)}`, GRANTS_UI_BACKEND_ENDPOINT).href

  logDebug(request, { method, endpoint, identity: key })

  let response
  try {
    response = await fetch(endpoint, {
      method,
      headers: await createApiHeadersForGrantsUiBackend()
    })
  } catch (err) {
    logError(request, { method, endpoint, identity: key, errorMessage: /** @type {Error} */ (err).message })
    throw err
  }

  if (!response.ok) {
    if (response.status === statusCodes.notFound) {
      logDebug(request, { method, endpoint, identity: key, summary: 'No feature control found' })
      return null
    }

    const errorMessage = `Failed to fetch feature control: ${response.status}`
    logError(request, { method, endpoint, identity: key, error: errorMessage })
    throw createBoomError(response.status, errorMessage)
  }

  const json = await response.json()

  if (typeof json !== 'boolean') {
    const errorMessage = `Unexpected feature control value format: ${JSON.stringify(json)}`
    logError(request, { method, endpoint, identity: key, error: errorMessage })
    throw new Error(errorMessage)
  }

  return json
}

/**
 * @import { AnyRequest } from '@defra/forms-engine-plugin/engine/types.js'
 * @import { LogCodeEntry } from '../logging/log.js'
 */
