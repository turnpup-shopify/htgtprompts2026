const API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-10';
const DEBUG_SHOPIFY = process.env.DEBUG_SHOPIFY === '1';

function logDebug(message, data) {
  if (!DEBUG_SHOPIFY) return;

  if (data === undefined) {
    console.log(`[shopify-debug] ${message}`);
    return;
  }

  console.log(`[shopify-debug] ${message}`, data);
}

function getShopifyEndpoint() {
  if (!process.env.SHOPIFY_SHOP) {
    throw new Error('Missing SHOPIFY_SHOP');
  }

  return `https://${process.env.SHOPIFY_SHOP}/admin/api/${API_VERSION}/graphql.json`;
}

export async function shopifyGraphql(query, variables = {}) {
  if (!process.env.SHOPIFY_ADMIN_TOKEN) {
    throw new Error('Missing SHOPIFY_ADMIN_TOKEN');
  }

  const endpoint = getShopifyEndpoint();
  logDebug('request', {
    endpoint,
    variables
  });

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_TOKEN
    },
    body: JSON.stringify({ query, variables })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Shopify request failed (${response.status}): ${body}`);
  }

  const payload = await response.json();
  logDebug('response_meta', {
    status: response.status,
    graphql_error_count: payload.errors?.length || 0,
    throttle_status: payload.extensions?.cost?.throttleStatus || null
  });

  if (payload.errors?.length) {
    throw new Error(`Shopify GraphQL errors: ${JSON.stringify(payload.errors)}`);
  }

  return payload.data;
}

export async function fetchAllActiveProducts() {
  const query = `
    query GetActiveProducts($first: Int!, $after: String) {
      products(first: $first, after: $after, query: "status:active") {
        edges {
          cursor
          node {
            id
            title
            handle
            productType
            status
            tags
            totalInventory
            featuredImage {
              url
            }
            images(first: 20) {
              edges {
                node {
                  url
                  altText
                }
              }
            }
            promptCategory: metafield(namespace: "prompt", key: "category") {
              value
            }
            promptSubcategory: metafield(namespace: "prompt", key: "subcategory") {
              value
            }
            promptHeroDescriptor: metafield(namespace: "prompt", key: "hero_descriptor") {
              value
            }
            promptStyleTags: metafield(namespace: "prompt", key: "style_tags") {
              value
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;

  const all = [];
  let hasNextPage = true;
  let after = null;

  while (hasNextPage) {
    const data = await shopifyGraphql(query, { first: 100, after });
    const connection = data.products;

    for (const edge of connection.edges) {
      all.push(edge.node);
    }

    hasNextPage = connection.pageInfo.hasNextPage;
    after = connection.pageInfo.endCursor;
    logDebug('page_loaded', {
      fetched_this_page: connection.edges.length,
      total_so_far: all.length,
      has_next_page: hasNextPage
    });
  }

  logDebug('done', { total_products: all.length });
  return all;
}
