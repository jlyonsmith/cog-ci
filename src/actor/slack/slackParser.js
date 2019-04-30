import rdparser from "recursive-descent"
import slackGrammar from "./slackGrammar"

const EOF = "#eof"
const STRING_LITERAL = "stringLiteral"
const NUMBER_LITERAL = "number"

export class SlackParser {
  constructor(container) {
    this.log = container.log
    this.slackParserRules = rdparser.bnfParse(slackGrammar)
  }

  // parses message into generic node format.
  parseMessage(message) {
    this.log.info(`parseMessage: ${message}`)
    let ast
    try {
      ast = rdparser.parse(this.slackParserRules, message)
      // rdparser.print(ast)
      ast = this.normalizeAST(ast)
      // this.log.info(JSON.stringify(ast, null, 2))
    } catch (ex) {
      //this.log.warn(`command not recognized: ${message}`)
    }

    return ast
  }

  // parses message into a command:argument map format
  parseCommand(message, argSpec = ["#", "A"]) {
    let response = { parsed: false }
    const ast = this.parseMessage(message)
    if (ast) {
      let command = { name: ast.type }
      if (argSpec.length > 0 && argSpec[0] == "#") {
        command.number = this.parseNumber(ast)
      }
      command.arguments = this.parseArgumentList(ast)
      response = { parsed: true, command }
    }

    return response
  }

  // find the nth instance of an unlabeled number argument and return it or (default or null) if nothing found
  parseNumber(ast, defValue = null, instance = 0) {
    const children = ast.children || []
    let n = 0
    for (let i = 0; i < children.length; i++) {
      let c = children[i]
      if (c.type == "number") {
        if (n == instance) {
          return c.value
        }
        n += 1
      }
    }
    return defValue
  }

  // parsed named argument list into a map
  parseArgumentList(ast) {
    let argMap = {}
    if (ast.children) {
      let rawArguments = ast.children.filter((c) => {
        return c.type == "argumentList"
      })
      rawArguments = rawArguments ? rawArguments[0] : []

      if (rawArguments) {
        rawArguments.children.forEach((arg) => {
          const argc = arg.children
          const name = argc[0].value.split(":")[0] //parse off trailing colon
          const value = argc[1].children[0].value
          argMap[name] = value
        })
      }
    }
    return argMap
  }

  /**
   * reduce ast format to compact object property format.
   * @param {*} ast
   */
  normalizeAST(ast) {
    if (ast.name != "program" || ast.tokens.length == 0) {
      throw Error("invalid AST: program root node missing")
    }
    return this.parseToken(ast.tokens[0])
  }

  parseToken(token) {
    const nodeType = token.name
    let node = {}
    if (token.tokens.length > 0) {
      let children = []
      for (let child of token.tokens) {
        children.push(this.parseToken(child))
      }
      node = { type: nodeType, children }
    } else {
      let value = token.value || null
      switch (nodeType) {
        case STRING_LITERAL:
          value = this.trimQuotes(value)
          break
        case NUMBER_LITERAL:
          value = parseFloat(value)
          break
      }
      node = { type: nodeType, value }
    }
    return node
  }

  trimQuotes(value) {
    if (value.charAt(0) == "'" && value.charAt(value.length - 1) == "'") {
      return value.substring(1, value.length - 1)
    }
    return value
  }
}
