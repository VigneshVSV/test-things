const express = require("express");
const fs = require("fs");
const path = require("path");
const bodyParser = require("body-parser");
const { parseArgs } = require("node:util");
const { JsonPlaceholderReplacer } = require("json-placeholder-replacer");
require("dotenv").config();

const app = express();
app.use(express.json({ strict: false }));

const hostname = "localhost";
let portNumber = 3000;
const thingName = "http-express-calculator-simple";

const TDEndPoint = `/${thingName}`,
  resultEndPoint = `/${thingName}/properties/result`,
  resultEndPointObserve = `${resultEndPoint}/observe`,
  lastChangeEndPoint = `/${thingName}/properties/lastChange`,
  lastChangeEndPointObserve = `${lastChangeEndPoint}/observe`,
  additionEndPoint = `/${thingName}/actions/add`,
  subtractionEndPoint = `/${thingName}/actions/subtract`,
  updateEndPoint = `/${thingName}/events/update`

const existingEndpoints = [TDEndPoint, resultEndPoint, resultEndPointObserve, lastChangeEndPoint, lastChangeEndPointObserve, additionEndPoint, subtractionEndPoint, updateEndPoint]

const {
  values: { port },
} = parseArgs({
  options: {
    port: {
      type: "string",
      short: "p",
    },
  },
});

if (port && !isNaN(parseInt(port))) {
  portNumber = parseInt(port);
}

const tmPath = process.env.TM_PATH;

if (process.platform === "win32") {
  tmPath.split(path.sep).join(path.win32.sep);
}

const thingModel = JSON.parse(fs.readFileSync(path.join(__dirname, tmPath)));

const placeholderReplacer = new JsonPlaceholderReplacer();
placeholderReplacer.addVariableMap({
  PROTOCOL: "http",
  THING_NAME: thingName,
  HOSTNAME: hostname,
  PORT_NUMBER: portNumber,
  RESULT_OBSERVABLE: true,
  LAST_CHANGE_OBSERVABLE: true
});
const thingDescription = placeholderReplacer.replace(thingModel);
thingDescription["@type"] = "Thing";

const defaultForm = {
  "href": "",
  "contentType": "application/json",
  "op": []
}

//add properties forms
for (const key in thingDescription['properties']) {

  thingDescription['properties'][key]['forms'] = []

  const newFormRead = JSON.parse(JSON.stringify(defaultForm))
  newFormRead['href'] = `properties/${key}`
  newFormRead['op'] = ["readproperty"]

  const newFormObs = JSON.parse(JSON.stringify(newFormRead))
  newFormObs['href'] = `properties/${key}/observe`
  newFormObs['op'] = ["observeproperty", "unobserveproperty"]
  newFormObs['subprotocol'] = "sse"

  thingDescription['properties'][key]['forms'].push(newFormRead)
  thingDescription['properties'][key]['forms'].push(newFormObs)
}

//add actions forms
for (const key in thingDescription['actions']) {

  thingDescription['actions'][key]['forms'] = []

  const newForm = JSON.parse(JSON.stringify(defaultForm))
  newForm['href'] = `actions/${key}`
  newForm['op'] = ["invokeaction"]

  thingDescription['actions'][key]['forms'].push(newForm)
}

//add events forms
for (const key in thingDescription['events']) {

  thingDescription['events'][key]['data']['type'] = "object"

  thingDescription['events'][key]['forms'] = []

  const newForm = JSON.parse(JSON.stringify(defaultForm))
  newForm['href'] = `events/${key}`
  newForm['op'] = ["subscribeevent", "unsubscribeevent"]
  newForm['subprotocol'] = "sse"

  thingDescription['events'][key]['forms'].push(newForm)
}

//Creating the TD for testing purposes
try {
  fs.writeFileSync('http-simple-calculator-thing.td.jsonld', JSON.stringify(thingDescription, null, 2))
} catch (err) {
  console.log(err);
}

const reqParser = bodyParser.text({ type: "*/*" });

let result = 0;
let lastChange = new Date().toISOString();

/******************************************/
/************** Middleware ****************/
/******************************************/

//Middleware to ensure the right endpoints are being called
app.use((req, res, next) => {
  const endpoint = req.url

  if (!existingEndpoints.includes(endpoint)) {
    res.status(404).json("Not Found")
  }
  else {
    next()
  }
})

//Middleware to ensure the right method is been used for each endpoint
app.use((req, res, next) => {
  const method = req.method
  const endpoint = req.url

  if (endpoint === TDEndPoint || endpoint === resultEndPoint || endpoint === resultEndPointObserve || endpoint === lastChangeEndPoint || endpoint === lastChangeEndPointObserve || endpoint === updateEndPoint) {
    if (method === 'GET') {
      next()
    } else {
      res.status(405).json('Method Not Allowed');
    }
  }

  if (endpoint === additionEndPoint || endpoint === subtractionEndPoint) {
    if (method === 'POST') {
      next()
    } else {
      res.status(405).json('Method Not Allowed');
    }
  }

})


/******************************************/
/*************** Endpoints ****************/
/******************************************/

app.get(TDEndPoint, (req, res) => {
  res.json(thingDescription);
});

app.get(resultEndPoint, (req, res) => {
  res.json(result);
});

app.get(resultEndPointObserve, (req, res) => {
  res.statusCode = 200;
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("connection", "keep-alive");
  res.setHeader("Content-Type", "text/event-stream");

  console.log("Client is listening to result property")
  let oldResult = result;

  const changeInterval = setInterval(() => {

    if (oldResult !== result) {
      res.write(`data: ${JSON.stringify(result)}\n\n`);
      oldResult = result;
    }
  }, 1000);

  res.on("finish", () => {
    clearInterval(changeInterval);
  });

  res.on("close", () => {
    console.log("Client stopped listening to result property");
  })
});

app.get(lastChangeEndPoint, (req, res) => {
  res.json(lastChange);
});

app.get(lastChangeEndPointObserve, (req, res) => {
  res.statusCode = 200;
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("connection", "keep-alive");
  res.setHeader("Content-Type", "text/event-stream");

  console.log("Client is listening to lastChange property");
  let oldLastChange = lastChange;

  const changeInterval = setInterval(() => {

    if (oldLastChange !== lastChange) {
      res.write(`data: ${JSON.stringify(lastChange)}\n\n`);
      oldLastChange = lastChange;
    }
  }, 1000);

  res.on("finish", () => {
    clearInterval(changeInterval);
  });

  res.on("close", () => {
    console.log("Client stopped listening to lastChange property");
  })
});

app.post(additionEndPoint, reqParser, (req, res) => {

  try {
    const bodyInput = JSON.parse(req.body)

    if (typeof bodyInput !== "number") {
      res.status(400).json("Input should be a valid number");
    } else {
      result += bodyInput;
      lastChange = new Date();
      res.json(result);
    }
  } catch (error) {
    res.status(400).json("Input should be a valid number");
  }

});

app.post(subtractionEndPoint, reqParser, (req, res) => {
  try {
    const bodyInput = JSON.parse(req.body)

    if (typeof bodyInput !== "number") {
      res.status(400).json("Input should be a valid number");
    } else {
      result -= bodyInput;
      lastChange = new Date();
      res.json(result);
    }
  } catch (error) {
    res.status(400).json("Input should be a valid number");
  }
});

app.get(updateEndPoint, (req, res) => {
  res.statusCode = 200;
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("connection", "keep-alive");
  res.setHeader("Content-Type", "text/event-stream");

  let oldResult = result;
  console.log("Client is listening to update event");

  /**
   * The SSE specification defines the structure of SSE messages, and
   * it expects event data to be formatted with "data:" followed by the
   * actual data. When you deviate from this standard, it might not be
   * interpreted correctly by the client, which could create empty values.
   */
  const changeInterval = setInterval(() => {

    if (oldResult !== result) {
      res.write(`data: ${result}\n\n`);
      oldResult = result;
    }
  }, 1000);

  res.on("finish", () => {
    clearInterval(changeInterval);
  });

  res.on("close", () => {
    console.log("Client stopped listening to update event");
  })
});

app.listen(portNumber, () => {
  console.log(`Started listening to localhost on port ${portNumber}`);
  console.log("ThingIsReady");
});
