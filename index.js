var crypto = require('crypto')
var assert = require('assert')
var LdapAuth = require('ldapauth-fork')
var parseDN = require('ldapjs').parseDN

module.exports = Auth

var ldapGroups = {}
var ldapPasswords = {}

function Auth(config, stuff) {
  var self = Object.create(Auth.prototype)
  self._users = {}

  // config for this module
  self._config = config

  // sinopia logger
  self._logger = stuff.logger

  // TODO: Set more defaults
  self._config.groupNameAttribute = self._config.groupNameAttribute || 'cn'

  return self
}

//
// Attempt to authenticate user against LDAP backend
//
Auth.prototype.authenticate = function(user, password, callback) {
  var self = this

  if (password === ldapPasswords[user]) {
    var userGroups = ldapGroups[user]
    if (userGroups) {
      self._logger.info('sinopia-ldap: getting ' + user + ' from memcache')
      return callback(null, userGroups)
    } 
  }  
  
  var LdapClient = new LdapAuth(self._config.client_options)

  LdapClient.authenticate(user, password, function(err, ldap_user) {
    if (err) {
      // 'No such user' is reported via error
      self._logger.warn({
        user: user,
        err: err,
      }, 'LDAP error @{err}')

      LdapClient.close(function(err) {
        if (err) {
          self._logger.warn({
             err: err
            }, 'LDAP error on close @{err}')
         }
      })

      return callback(null, false)
    }

    if (ldap_user) {
      var groups = [ user ]
      if ('memberOf' in ldap_user) {
        if (!Array.isArray(ldap_user.memberOf)) {
          ldap_user.memberOf = [ ldap_user.memberOf ]
        }
        for (var i = 0; i < ldap_user.memberOf.length; i++) {
          groups.push("%" + parseDN(ldap_user.memberOf[i]).rdns[0][self._config.groupNameAttribute])
        }
      }
    }

    ldapPasswords[user] = password
    ldapGroups[user] = groups
    self._logger.info('authenticated from LDAP', user)
    
    callback(null, groups)

    LdapClient.close(function(err) {
      if (err) {
        self._logger.warn({
           err: err
          }, 'LDAP error on close @{err}')
       }
    })

  })
}
