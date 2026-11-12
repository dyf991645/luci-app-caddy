include $(TOPDIR)/rules.mk

PKG_NAME:=caddy-binary
# Generated from the freshly downloaded executable by scripts/build.py.
-include $(TOPDIR)/package/caddy-binary/upstream.mk
PKG_VERSION:=$(CADDY_UPSTREAM_VERSION)
PKG_RELEASE:=6
PKG_LICENSE:=Apache-2.0
PKG_SOURCE:=caddy-$(PKG_VERSION)-cloudflare-linux-arm64
PKG_SOURCE_URL:=https://caddyserver.com/api
PKG_SOURCE_URL_FILE:=download?os=linux&arch=arm64&p=github.com%2Fcaddy-dns%2Fcloudflare
PKG_HASH:=skip

# Keep the downloaded upstream executable byte-for-byte intact.
RSTRIP:=:

include $(INCLUDE_DIR)/package.mk

define Package/caddy-binary
  SECTION:=net
  CATEGORY:=Network
  TITLE:=Upstream Caddy with the Cloudflare DNS provider
  URL:=https://caddyserver.com/
  DEPENDS:=@aarch64
  # APK conflicts are negative dependencies; keep them out of Kconfig DEPENDS.
  EXTRA_DEPENDS:=!caddy (>=0)
  CONFLICTS:=caddy
  PKGARCH:=aarch64_cortex-a53
endef

define Package/caddy-binary/conffiles
/etc/caddy/active.json
endef

define Build/Prepare
	[ -n "$(CADDY_UPSTREAM_VERSION)" ]
	[ "$(ARCH_PACKAGES)" = aarch64_cortex-a53 ]
	$(INSTALL_DIR) $(PKG_BUILD_DIR)
	$(CP) $(DL_DIR)/$(PKG_SOURCE) $(PKG_BUILD_DIR)/caddy
endef

define Build/Compile
endef

define Package/caddy-binary/preinst
#!/bin/sh
# APK runs the NEW pre-upgrade before replacing files, not the old prerm.
if [ -z "$${IPKG_INSTROOT}" ]; then
	rm -f /var/run/caddy-package-running
	if [ "$${PKG_UPGRADE}" = 1 ] && /etc/init.d/caddy running 2>/dev/null; then
		umask 077
		: > /var/run/caddy-package-running || exit 1
		/etc/init.d/caddy stop || exit 1
	fi
fi
endef

define Package/caddy-binary/postinst
#!/bin/sh
# default_postinst's automatic enable/start is suppressed by caddy.init.
if [ -z "$${IPKG_INSTROOT}" ]; then
	if [ "$${PKG_UPGRADE}" = 1 ] && [ -f /var/run/caddy-package-running ]; then
		rm -f /var/run/caddy-package-running
		pkgname='' /etc/init.d/caddy start
	else
		rm -f /var/run/caddy-package-running
	fi
fi
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
