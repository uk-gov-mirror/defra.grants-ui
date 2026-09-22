import { YarKeys } from '../../constants/session-keys.js'
import { getGrantCode } from '../../helpers/grant-code.js'
import { getFeatureControlValue } from '../../helpers/feature-controls/feature-control-client.js'
import { isWindowClosedMockEnabled } from '../../helpers/mock-overrides.js'
import { shouldHandlePreSubmission } from './forms-status-redirect.js'

/**
 * @param {import('../types.js').PipelineRequest & import('@defra/forms-engine-plugin/engine/types.js').AnyFormRequest} request
 * @param {import('@hapi/hapi').ResponseToolkit} h
 * @param {import('@defra/forms-engine-plugin/engine/types.js').FormContext} context
 */
export async function applicationWindowClosedRedirect(request, h, context) {
  const def = /** @type {{ name?: string } | undefined} */ (
    /** @type {{ model?: { def?: unknown } }} */ (request.app).model?.def
  )

  const featureControlValue = await getFeatureControlValue(`application-window-open:${getGrantCode(request)}`, request)

  const isWindowClosed = featureControlValue === false || isWindowClosedMockEnabled(request)

  if (!isWindowClosed) {
    return h.continue
  }

  const previousStatus = /** @type {string | undefined} */ (context.state?.applicationStatus)

  if (!shouldHandlePreSubmission(previousStatus)) {
    return h.continue
  }

  const basePath = request.params.slug ? `/${request.params.slug}` : ''

  if (request.path === `${basePath}/application-window-closed`) {
    return h.continue
  }

  request.yar.set(YarKeys.APPLICATION_WINDOW_CLOSED_SCHEME_NAME, def?.name)

  return h.redirect(`${basePath}/application-window-closed`).takeover()
}
