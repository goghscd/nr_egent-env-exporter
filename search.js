#!/usr/bin/env node

const axios = require('axios');
const Table = require('cli-table3');

const {argv} = require('yargs')
.option('account', {
  alias: 'a',
  type: 'string',
  description: 'Account ID'
})
.option('apikey', {
  alias: 'k',
  type: 'string',
  description: 'New Relic API key NRAK-...'
})
.option('starts', {
  type: 'string',
  description: 'Starts with filter'
})
.option('contains', {
  type: 'string',
  description: 'Contains filter'
})
.option('field', {
  type: 'string',
  default: 'settings',
  choices: ['modules','settings'], 
  description: 'Field type to look up'
})
.demandOption(['account','apikey'],"You must provide at least API key and account id")

const STARTSWITH = argv['starts']
const CONTAINS = argv['contains']  
const ACCOUNTID =  argv['account'] 
const APIKEY =  argv['apikey'] 
const FIELDTYPE =  argv['field']

if(! (ACCOUNTID && APIKEY)) {
  console.log("Error account or apikey are blank")
  process.exit(1)
}



// Determine which filter yo use
let FILTER = "filter: {}"
let FILTERTEXT = "none"
if(STARTSWITH ) {
  FILTER = `filter: {startsWith: "${STARTSWITH}"}`
  FILTERTEXT = `Filter: Starts with "${STARTSWITH}"`
}
if(CONTAINS ) {
  FILTER = `filter: {contains: "${CONTAINS}"}`
  FILTERTEXT = `Filter: Contains "${CONTAINS}"`
}


async function doRequest(cursor) {

  let cursorString = ""
  if(cursor) {
      if(FILTER) {
        cursorString=` , cursor: "${cursor}"`
      } else {
        cursorString=`cursor: "${cursor}"`
      }
  } 

  let gql=""
  switch(FIELDTYPE) {
    case "modules":
      gql=`{ actor {account(id: ${ACCOUNTID}) { agentEnvironment { modules(${FILTER} ${cursorString} ) { nextCursor results { applicationGuids details { host id name language} loadedModules { name version } } } }} }}`
      break;
    case "settings":
      gql=`{ actor {account(id: ${ACCOUNTID}) { agentEnvironment { environmentAttributes(${FILTER} ${cursorString} ) { nextCursor results { applicationGuids details { host id name language} attributes { attribute value } } } }} }}`
      break;
  }


  let req = {

    url: 'https://api.newrelic.com/graphql',
    method: 'post', // default
    headers: { 
      'Content-Type': 'application/json',
      'API-Key': APIKEY
    },

    data: {
      query: gql,
      variables: ""
    },
    timeout: 1000, // default is `0` (no timeout)

  }

  try {
    let response = await axios.request(req)
    if(response.data && response.data.data.actor.account) {

      let results
      switch(FIELDTYPE) {
        case "modules":
          results=response.data.data.actor.account.agentEnvironment.modules.results.filter((app)=>{return app.loadedModules && app.loadedModules.length > 0})
          return {cursor: response.data.data.actor.account.agentEnvironment.modules.nextCursor, results: results}
          break;
        case "settings":
          results=response.data.data.actor.account.agentEnvironment.environmentAttributes.results.filter((app)=>{return app.attributes && app.attributes.length > 0})
          return {cursor: response.data.data.actor.account.agentEnvironment.environmentAttributes.nextCursor, results: results}
          break;
      }
    
     
    }
  } catch (err) {
    console.log(err);
  }

}

function drawTable(data) {
  


let headerFields=[ 'Host', 'Name', 'Language','Application IDs']
switch(FIELDTYPE) {
  case "modules":
    headerFields=headerFields.concat(['Jar','Version'])
    break;
  case "settings":
    headerFields=headerFields.concat(['Attribute','Value'])
    break;
}
// instantiate
var table = new Table({
  head: headerFields
});

data.forEach((item)=>{
  if(item.applicationGuids.length > 1){
    console.log(`Unexpected multiple application GUIDS - not currently handling those sorry!`,item)
  }
  switch(FIELDTYPE) {
    case "modules":
      item.loadedModules.forEach((module)=>{
        table.push([ item.details.host,  item.details.name, item.details.language, item.applicationGuids[0], module.name, module.version])
      })
      break;
    case "settings":
      item.attributes.forEach((attr)=>{
        table.push([item.details.host,  item.details.name, item.details.language, item.applicationGuids[0], attr.attribute, attr.value])
      })
      break;
  }

  
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
  console.log(FILTERTEXT)
  console.log(`Hosts: ${allResults.length}`)
  drawTable(allResults)
}


run()

