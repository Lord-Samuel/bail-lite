import { Boom } from '@hapi/boom';
import { getBinaryNodeChild, S_WHATSAPP_NET } from '../WABinary/index.js';
const wMexQuery = (variables, queryId, query, generateMessageTag) => {
    return query({
        tag: 'iq',
        attrs: {
            id: generateMessageTag(),
            type: 'get',
            to: S_WHATSAPP_NET,
            xmlns: 'w:mex'
        },
        content: [
            {
                tag: 'query',
                attrs: { query_id: queryId },
                content: Buffer.from(JSON.stringify({ variables }), 'utf-8')
            }
        ]
    });
};
export const executeWMexQuery = async (variables, queryId, dataPath, query, generateMessageTag) => {
  const result = await wMexQuery(variables, queryId, query, generateMessageTag);
  const child = getBinaryNodeChild(result, "result");
    
  if (child?.content) {
    try {
      const data = JSON.parse(child.content.toString());
      
      if (data.errors && data.errors.length > 0) {
        const errorMessages = data.errors.map((err) => err.message || "Unknown error").join(", ");
        const firstError = data.errors[0];
        const errorCode = firstError.extensions?.error_code || 400;
        throw new Boom(`GraphQL server error: ${errorMessages}`, { statusCode: errorCode, data: firstError });
      }

      let response;
      if (dataPath) {
        response = data?.data?.[dataPath];
        if (typeof response === 'undefined') {
          response = data?.data;
        }
      } else {
        response = data?.data;
      }

      if (typeof response !== "undefined") {
        return response;
      }
    } catch (parseError) {
      console.error('Parse error:', parseError);
      throw new Boom(`Failed to parse response: ${parseError.message}`, { statusCode: 400 });
    }
  }

  throw new Boom(`Failed to execute query, unexpected response structure.`, { 
    statusCode: 400, 
    data: { result, child: child ? 'exists' : 'missing' } 
  });
};
//# sourceMappingURL=mex.js.map