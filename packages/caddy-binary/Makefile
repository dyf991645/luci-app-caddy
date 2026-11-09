include $(TOPDIR)/rules.mk

PKG_NAME:=caddy-binary
PKG_VERSION:=2.11.8
PKG_RELEASE:=1
PKG_LICENSE:=Apache-2.0
PKG_SOURCE:=caddy-2.11.8-cloudflare-0.2.4-linux-arm64
PKG_SOURCE_URL:=https://caddyserver.com/api
PKG_SOURCE_URL_FILE:=download?os=linux&arch=arm64&p=github.com%2Fcaddy-dns%2Fcloudflare%40v0.2.4
PKG_HASH:=6d8d57926dd4bd5ce4894ec38b7e18c4bf5d18a569cd36826e8b8300d160f686

# Keep the reviewed upstream executable byte-for-byte intact.
RSTRIP:=:

include $(INCLUDE_DIR)/package.mk

define Package/caddy-binary
  SECTION:=net
  CATEGORY:=Network
  TITLE:=Upstream Caddy with the Cloudflare DNS provider
  URL:=https://caddyserver.com/
  DEPENDS:=@aarch64 !caddy
  CONFLICTS:=caddy
  PKGARCH:=aarch64_cortex-a53
endef

define Package/caddy-binary/conffiles
/etc/caddy/active.json
endef

define Build/Prepare
	[ "$(ARCH_PACKAGES)" = aarch64_cortex-a53 ]
	$(INSTALL_DIR) $(PKG_BUILD_DIR)
	$(CP) $(DL_DIR)/$(PKG_SOURCE) $(PKG_BUILD_DIR)/caddy
endef

define Build/Compile
endef

define Package/caddy-binary/install
	$(INSTALL_DIR) $(1)/usr/bin $(1)/etc/init.d $(1)/etc/caddy/data
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/caddy $(1)/usr/bin/caddy
	$(INSTALL_BIN) ./files/caddy.init $(1)/etc/init.d/caddy
	$(INSTALL_CONF) ./files/active.json $(1)/etc/caddy/active.json
	chmod 0700 $(1)/etc/caddy $(1)/etc/caddy/data
	chmod 0600 $(1)/etc/caddy/active.json
endef

$(eval $(call BuildPackage,caddy-binary))
