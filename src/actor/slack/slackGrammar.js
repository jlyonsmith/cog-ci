const slackGrammar = String.raw`

    //special ignore token to allow and ignore whitespace
    ignore = ~[\s]+~ ;
    colon = ~:~ ;
    argname = ~[a-zA-Z_][0-9a-zA-Z_\-\.]{0,20}:~ ;

    // language word tokens
    //verbs
    stop = ~stop~ ;
    start = ~start~ ;
    create = ~create~ ;
    show = ~show~ ;
    // nouns
    test = ~test~ ;
    builds = ~builds~ ;
    build = ~build~ ;
    status = ~status~ ;
    help = ~help~ ;
    pullRequest = ~(pull-request|pull request|pr)~ ;
    queue = ~queue~ ;
    daemon = ~daemon~ ;
    report = ~report~ ;


    identifier = ~[a-zA-Z_][0-9a-zA-Z_\-\.]{0,60}~ ;
    stringLiteral = ~'([^'\\]*(?:\\.[^'\\]*)*)'~ ;
    number = ~(\-)?[0-9]+(\.[0-9]+)?~ ;

    // The Program ============================
    program : < commands ;

    commands :
      testCommand |
      startBuildCommand |
      stopBuildCommand |
      createPullRequestCommand |
      showBuildsCommand |
      showQueueCommand |
      statusCommand |
      startDaemonCommand |
      stopDaemonCommand ;

    // commands -----------
    testCommand : @ < test ;
    startBuildCommand : @ < start ? < build argumentList ;
    stopBuildCommand : @ < stop < build number  ;
    createPullRequestCommand : @ < create ? < pullRequest argumentList ;
    showBuildsCommand : @ < show < builds number ? argumentList ? ;
    showQueueCommand : @ < show < queue number ? argumentList ? ;
    statusCommand : @ < show? < status  ;
    startDaemonCommand : @ < start < daemon ;
    stopDaemonCommand : @ < stop < daemon ;

    // tokens ----------------------
    argumentList : argument argument * ;

    // argument : identifier < colon literal ;
    argument : argname literal ;

    literal : identifier | stringLiteral | number ;

    `
module.exports = slackGrammar
