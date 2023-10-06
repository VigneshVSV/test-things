const Ajv = require('ajv')
const chai = require('chai')
const http = require('http')
const https = require('https')
const path = require('path')

const spawn = require('child_process').spawn

const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false })

const expect = chai.expect
const port = 3000
let thingProcess

describe('Calculator HTTP JS', () => {
  let validate

  before(async () => {
    const initiateMain = new Promise(async (resolve, reject) => {
      thingProcess = spawn(
        'node',
        ['main.js', '-p', `${port}`],
        { cwd: path.join(__dirname, '..') }
      )
      thingProcess.stdout.on('data', (data) => {
        if (data.toString().includes('ThingIsReady')) {
          resolve('Success')
        }
      })
      thingProcess.stderr.on('data', (data) => {
        reject(`Error: ${data}`)
      })
      thingProcess.on('error', (error) => {
        reject(`Error: ${error}`)
      })
      thingProcess.on('close', () => {
        reject('Failed to initiate the main script.')
      })
    })

    const getJSONSchema = new Promise((resolve, reject) => {
      https.get('https://raw.githubusercontent.com/w3c/wot-thing-description/main/validation/td-json-schema-validation.json', function (response) {
        const body = []
        response.on('data', (chunk) => {
          body.push(chunk)
        })

        response.on('end', () => {
          const tdSchema = JSON.parse(Buffer.concat(body).toString())
          validate = ajv.compile(tdSchema)
          resolve('Success')
        })
      })
    })

    await Promise.all([initiateMain, getJSONSchema]).then(data => {
      if (data[0] !== 'Success' || data[1] !== 'Success') {
        console.log(`initiateMain: ${data[0]}`)
        console.log(`getJSONSchema: ${data[1]}`)
      }
    })
  })

  after(() => {
    thingProcess.kill()
  })

  it('should have a valid TD', (done) => {
    http.get(`http://localhost:${port}/http-express-calculator`, function (response) {
      const body = []
      response.on('data', (chunk) => {
        body.push(chunk)
      })

      response.on('end', () => {
        try {
          const result = JSON.parse(Buffer.concat(body).toString())
          const valid = validate(result)
          expect(valid).to.be.true
          done()
        } catch (error) {
          console.log(error)
        }
      })
    })
  })
})
