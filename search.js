#!/usr/bin/env node

const axios = require('axios');
const Table = require('cli-table3');
const fs = require('fs');

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
.option('timeout', {
  type: 'int',
  default: 1000,
  description: 'Timeout per request, in ms; 0 means no timeout'
})
.option('cursor', {
  type: 'string',
  description: 'A cursor to start querying with'
})
.option('liveresults', {
  type: 'boolean',
  default: false,
  description: 'If true, output results one page at a time; helpful for debugging'
})
.option('out', {
  type: 'string',
  normalize: true,
  description: 'Path to output files for results (both JSON and TSV); file extension should be omitted'
})
.option('limit', {
  type: 'number',
  default: 0,
  description: 'Stop querying after this many pages of results have been fetched; helpful for debugging'
})
.demandOption(['account','apikey'],"You must provide at least API key and account id")

const STARTSWITH = argv['starts']
const CONTAINS = argv['contains']  
const ACCOUNTID =  argv['account'] 
const APIKEY =  argv['apikey'] 
const FIELDTYPE =  argv['field']
const TIMEOUT =  argv['timeout']
const CURSOR =  argv['cursor']
const LIVERESULTS =  argv['liveresults']
const OUTFILE =  argv['out']
const LIMIT =  argv['limit']

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
    timeout: TIMEOUT, // default is `0` (no timeout)

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

function makeTable(data, tableStyle) {
  let headerFields = ['Host', 'Name', 'Language', 'Application IDs']
  switch (FIELDTYPE) {
    case "modules":
      headerFields = headerFields.concat(['Jar', 'Version'])
      break;
    case "settings":
      headerFields = headerFields.concat(['Attribute', 'Value'])
      break;
  }

  let tableOptions = {
    head: headerFields
  };
  if (tableStyle) {
    tableOptions.style = tableStyle;
  }
  let table = new Table(tableOptions);

  data.forEach((item) => {
    if (item.applicationGuids.length > 1) {
      console.log(`Unexpected multiple application GUIDS - not currently handling those sorry!`, item)
    }
    switch (FIELDTYPE) {
      case "modules":
        item.loadedModules.forEach((module) => {
          table.push([item.details.host, item.details.name, item.details.language, item.applicationGuids[0], module.name, module.version])
        })
        break;
      case "settings":
        item.attributes.forEach((attr) => {
          table.push([item.details.host, item.details.name, item.details.language, item.applicationGuids[0], attr.attribute, attr.value])
        })
        break;
    }
  })
  return table;
}

function drawTable(data) {
  let table = makeTable(data);
  console.log(table.toString());
}

function tableAsTabSeparatedValues(data) {
  let table = makeTable(data, {
    "padding-left": 0,
    "padding-right": 0,
    head: [], //disable colors in header cells
    border: [], //disable colors for the border
  });

  table.options.chars = { 'top': '' , 'top-mid': '' , 'top-left': '' , 'top-right': ''
         , 'bottom': '' , 'bottom-mid': '' , 'bottom-left': '' , 'bottom-right': ''
         , 'left': '' , 'left-mid': '' , 'mid': '' , 'mid-mid': ''
         , 'right': '' , 'right-mid': '' , 'middle': '\t' };
  return table.toString();
}


async function run() {

  let tryNextPage=true
  let cursor = CURSOR
  let allResults=[]

  process.stdout.write(`\nGathering data (timeout=${TIMEOUT}) ..`);

  // Bail gracefully for Ctrl+C
  process.on('SIGINT', function() {
    tryNextPage = false;
  });

  let pageCount = 0;
  while(tryNextPage) {
    if (LIMIT && pageCount >= LIMIT) {
      process.stdout.write(`\nLimit (${LIMIT}) hit, stopping`);
      break;
    }
    let result = await (doRequest(cursor))
    pageCount++;
    if (result) {
      if (result.cursor) {
        cursor = result.cursor
      } else {
        tryNextPage = false
      }
      if (LIVERESULTS && result.results.length > 0) {
        process.stdout.write(`\nResults for cursor ${cursor}`);
        drawTable(result.results)
      } else {
        process.stdout.write(".");
      }

      allResults = allResults.concat(result.results)
    } else {
      process.stderr.write(`\nRetrying failed request using cursor ${cursor}`)
    }
  }

  console.log(`\n\nAccount: ${ACCOUNTID}`)
  console.log(FILTERTEXT)
  console.log(`Hosts: ${allResults.length}`)
  drawTable(allResults)

  if (OUTFILE) {
    fs.writeFileSync(
        `${OUTFILE}.json`,
        JSON.stringify(allResults, null, 2)
    );
    fs.writeFileSync(
        `${OUTFILE}.tsv`,
        tableAsTabSeparatedValues(allResults)
    );
    process.stdout.write(`\nWrote results to ${OUTFILE}[.json|.tsv]\n`);
  }
}


run()

