# New Relic APM Entity Environment Inspector

A tool to export your current environment snapshot data.

## Usage

```
./search.js --account <ACCOUNTID>  --apikey <APIKEY>  --field <settings|modules> --starts <FILTERSTRING> --contains <FILTERSTRING>

e.g.

./search.js --account 1234  --apikey "NRAK-MyKeyHere"  --field modules --starts "kafka" 
./search.js --account 1234  --apikey "NRAK-MyKeyHere"  --field settings --contains "Framework" 
```


For help:

```
./search.js -h
```
