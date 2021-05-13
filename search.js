const axios = require('axios');
const Table = require('cli-table3');

const SEARCH = 'kafka-'
const ACCOUNTID = 0
const APIKEY = 'NRAK-'



async function doRequest(cursor) {

  let cursorString = cursor ? ` , cursor: "${cursor}"`: ""


  let req = {

    url: 'https://api.newrelic.com/graphql',
    method: 'post', // default
    headers: { 
      'Content-Type': 'application/json',
      'API-Key': APIKEY
    },

    // `data` is the data to be sent as the request body
    // Only applicable for request methods 'PUT', 'POST', 'DELETE , and 'PATCH'
    // When no `transformRequest` is set, must be of one of the following types:
    // - string, plain object, ArrayBuffer, ArrayBufferView, URLSearchParams
    // - Browser only: FormData, File, Blob
    // - Node only: Stream, Buffer
    data: {
      query: `{ actor {account(id: ${ACCOUNTID}) { agentEnvironment { modules(filter: {startsWith: "${SEARCH}"} ${cursorString} ) { nextCursor results { applicationGuids details { host name} loadedModules { name version } } } }} }}`,
      variables: ""
    },
    timeout: 1000, // default is `0` (no timeout)

  }

  try {
    let response = await axios.request(req)
    
    if(response.data && response.data.data.actor.account) {
      let results=response.data.data.actor.account.agentEnvironment.modules.results.filter((app)=>{return app.loadedModules && app.loadedModules.length > 0})

      return {cursor: response.data.data.actor.account.agentEnvironment.modules.nextCursor, results: results}
    }
  } catch (err) {
    console.log(err);
  }

}

function drawTable(data) {
  
// instantiate
var table = new Table({
    head: ['Application ID', 'Host', 'Name', 'Jar', 'Version']
});
 
data.forEach((item)=>{
  item.loadedModules.forEach((module)=>{
    table.push([item.applicationGuids[0], item.details.host, item.details.name, module.name, module.version])
  })
  
})
  
 
console.log(table.toString());
}


async function run() {

  let tryNextPage=true
  let cursor = null
  let allResults=[]

  process.stdout.write("\nGathering data ..");
  while(tryNextPage) {
    process.stdout.write(".");
    let result = await(doRequest(cursor))
    if(result.cursor) {
      cursor = result.cursor
    } else {
      tryNextPage = false
    }

    allResults=allResults.concat(result.results)
  }

  console.log(`\n\nAccount: ${ACCOUNTID}`)
  console.log(`Search: "${SEARCH}"`)
  console.log(`Applications: ${allResults.length}`)
  drawTable(allResults)
}


run()

