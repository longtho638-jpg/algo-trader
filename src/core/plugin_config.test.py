#!/usr/bin/env python3
"""
Tests for Plugin Configuration Management

Run: python3 -m pytest src/core/plugin_config.test.py -v
"""

import tempfile
from pathlib import Path

import pytest

# Import directly from same directory
from plugin_config import (
    PluginConfig,
    PluginConfigLoadError,
    PluginConfigManager,
    PluginConfigSaveError,
    PluginConfigValidationError,
    PluginRegistry,
    load_plugin,
    load_plugins,
    save_plugin,
    save_plugins,
)


class TestPluginConfig:
    """Tests for PluginConfig dataclass."""

    def test_create_valid_config(self) -> None:
        """Test creating a valid plugin configuration."""
        config = PluginConfig(
            name="test-plugin",
            enabled=True,
            priority=50,
            config={"key": "value"},
        )

        assert config.name == "test-plugin"
        assert config.enabled is True
        assert config.priority == 50
        assert config.config == {"key": "value"}
        assert config.secrets == {}

    def test_default_values(self) -> None:
        """Test default configuration values."""
        config = PluginConfig(name="my-plugin")

        assert config.enabled is True
        assert config.priority == 100
        assert config.config == {}
        assert config.secrets == {}

    def test_validate_empty_name(self) -> None:
        """Test validation fails with empty name."""
        with pytest.raises(PluginConfigValidationError) as exc_info:
            PluginConfig(name="")

        assert "non-empty string" in str(exc_info.value)

    def test_validate_long_name(self) -> None:
        """Test validation fails with name too long."""
        long_name = "a" * 101

        with pytest.raises(PluginConfigValidationError) as exc_info:
            PluginConfig(name=long_name)

        assert "too long" in str(exc_info.value)

    def test_validate_invalid_characters(self) -> None:
        """Test validation fails with invalid characters in name."""
        with pytest.raises(PluginConfigValidationError) as exc_info:
            PluginConfig(name="test@plugin!")

        assert "invalid characters" in str(exc_info.value)

    def test_validate_valid_names(self) -> None:
        """Test various valid plugin names."""
        valid_names = [
            "simple",
            "with-dash",
            "with_underscore",
            "with.dots",
            "MixedCase123",
        ]

        for name in valid_names:
            config = PluginConfig(name=name)
            assert config.name == name

    def test_validate_priority_range(self) -> None:
        """Test priority validation."""
        # Valid priorities
        PluginConfig(name="test", priority=0)
        PluginConfig(name="test", priority=100)
        PluginConfig(name="test", priority=10000)

        # Invalid priorities
        with pytest.raises(PluginConfigValidationError):
            PluginConfig(name="test", priority=-1)

        with pytest.raises(PluginConfigValidationError):
            PluginConfig(name="test", priority=10001)

    def test_validate_priority_type(self) -> None:
        """Test priority must be integer."""
        with pytest.raises(PluginConfigValidationError):
            PluginConfig(name="test", priority="high")  # type: ignore[arg-type]

        with pytest.raises(PluginConfigValidationError):
            PluginConfig(name="test", priority=50.5)  # type: ignore[arg-type]

    def test_validate_config_type(self) -> None:
        """Test config must be dictionary."""
        with pytest.raises(PluginConfigValidationError):
            PluginConfig(name="test", config="not-a-dict")  # type: ignore[arg-type]

    def test_validate_secrets_type(self) -> None:
        """Test secrets must be dictionary."""
        with pytest.raises(PluginConfigValidationError):
            PluginConfig(name="test", secrets=["not-a-dict"])  # type: ignore[arg-type]

    def test_to_dict(self) -> None:
        """Test converting config to dictionary."""
        config = PluginConfig(
            name="test-plugin",
            enabled=False,
            priority=75,
            config={"api_key": "secret123"},
            secrets={"password": "hunter2"},
        )

        # Without secrets
        data = config.to_dict()
        assert data == {
            "name": "test-plugin",
            "enabled": False,
            "priority": 75,
            "config": {"api_key": "secret123"},
        }
        assert "secrets" not in data

        # With secrets
        data_with_secrets = config.to_dict(include_secrets=True)
        assert data_with_secrets["secrets"] == {"password": "hunter2"}

    def test_from_dict(self) -> None:
        """Test creating config from dictionary."""
        data = {
            "name": "from-dict-plugin",
            "enabled": False,
            "priority": 200,
            "config": {"key": "value"},
            "secrets": {"token": "abc123"},
        }

        config = PluginConfig.from_dict(data)

        assert config.name == "from-dict-plugin"
        assert config.enabled is False
        assert config.priority == 200
        assert config.config == {"key": "value"}
        assert config.secrets == {"token": "abc123"}

    def test_from_dict_minimal(self) -> None:
        """Test creating config with minimal data."""
        data = {"name": "minimal-plugin"}

        config = PluginConfig.from_dict(data)

        assert config.name == "minimal-plugin"
        assert config.enabled is True
        assert config.priority == 100
        assert config.config == {}

    def test_from_dict_invalid(self) -> None:
        """Test creating config from invalid data."""
        with pytest.raises(PluginConfigValidationError):
            PluginConfig.from_dict("not-a-dict")  # type: ignore[arg-type]


class TestPluginRegistry:
    """Tests for PluginRegistry dataclass."""

    def test_create_registry(self) -> None:
        """Test creating an empty registry."""
        registry = PluginRegistry()

        assert len(registry.plugins) == 0
        assert registry.version == 1

    def test_add_plugin(self) -> None:
        """Test adding plugins to registry."""
        registry = PluginRegistry()

        config1 = PluginConfig(name="plugin-a", priority=100)
        config2 = PluginConfig(name="plugin-b", priority=50)

        registry.add(config1)
        registry.add(config2)

        assert len(registry.plugins) == 2
        assert registry.get("plugin-a") == config1
        assert registry.get("plugin-b") == config2

    def test_remove_plugin(self) -> None:
        """Test removing a plugin from registry."""
        registry = PluginRegistry()
        config = PluginConfig(name="to-remove")
        registry.add(config)

        assert registry.remove("to-remove") is True
        assert registry.get("to-remove") is None
        assert registry.remove("nonexistent") is False

    def test_list_enabled(self) -> None:
        """Test listing enabled plugins sorted by priority."""
        registry = PluginRegistry()

        registry.add(PluginConfig(name="c-plugin", enabled=True, priority=300))
        registry.add(PluginConfig(name="a-plugin", enabled=True, priority=100))
        registry.add(PluginConfig(name="b-plugin", enabled=False, priority=200))

        enabled = registry.list_enabled()

        assert len(enabled) == 2
        assert enabled[0].name == "a-plugin"  # Lowest priority first
        assert enabled[1].name == "c-plugin"

    def test_list_all(self) -> None:
        """Test listing all plugins sorted by priority."""
        registry = PluginRegistry()

        registry.add(PluginConfig(name="high", priority=500))
        registry.add(PluginConfig(name="low", priority=50))
        registry.add(PluginConfig(name="medium", priority=250))

        all_plugins = registry.list_all()

        assert len(all_plugins) == 3
        assert [p.name for p in all_plugins] == ["low", "medium", "high"]

    def test_to_dict(self) -> None:
        """Test converting registry to dictionary."""
        registry = PluginRegistry(version=2)
        registry.add(PluginConfig(name="plugin-a", priority=100))
        registry.add(PluginConfig(name="plugin-b", priority=200))

        data = registry.to_dict()

        assert data["version"] == 2
        assert len(data["plugins"]) == 2
        assert data["plugins"][0]["name"] == "plugin-a"

    def test_from_dict_list_format(self) -> None:
        """Test creating registry from list format."""
        data = {
            "version": 1,
            "plugins": [
                {"name": "plugin-a", "priority": 100},
                {"name": "plugin-b", "priority": 200, "enabled": False},
            ],
        }

        registry = PluginRegistry.from_dict(data)

        assert registry.version == 1
        assert len(registry.plugins) == 2
        assert registry.get("plugin-a").priority == 100
        assert registry.get("plugin-b").enabled is False

    def test_from_dict_dict_format(self) -> None:
        """Test creating registry from dict format."""
        data = {
            "version": 1,
            "plugins": {
                "plugin-a": {"priority": 100},
                "plugin-b": {"priority": 200, "enabled": False},
            },
        }

        registry = PluginRegistry.from_dict(data)

        assert len(registry.plugins) == 2
        assert registry.get("plugin-a").name == "plugin-a"
        assert registry.get("plugin-b").priority == 200

    def test_from_dict_invalid(self) -> None:
        """Test creating registry from invalid data."""
        with pytest.raises(PluginConfigValidationError):
            PluginRegistry.from_dict("not-a-dict")  # type: ignore[arg-type]

    def test_validate_all(self) -> None:
        """Test validating all plugins in registry."""
        registry = PluginRegistry()

        # Valid plugin
        registry.add(PluginConfig(name="valid-plugin"))

        # Invalid plugin (bypass __post_init__ by adding directly)
        invalid_config = PluginConfig.__new__(PluginConfig)
        invalid_config.name = ""
        invalid_config.enabled = True
        invalid_config.priority = 100
        invalid_config.config = {}
        invalid_config.secrets = {}
        registry.plugins["invalid-plugin"] = invalid_config

        errors = registry.validate_all()

        assert "valid-plugin" not in errors
        assert "invalid-plugin" in errors


class TestPluginConfigManager:
    """Tests for PluginConfigManager."""

    @pytest.fixture
    def temp_dir(self) -> Path:
        """Create a temporary directory for tests."""
        with tempfile.TemporaryDirectory() as tmpdir:
            yield Path(tmpdir)

    @pytest.fixture
    def manager(self, temp_dir: Path) -> PluginConfigManager:
        """Create a PluginConfigManager with temp directory."""
        return PluginConfigManager(temp_dir)

    def test_init_creates_dir(self, temp_dir: Path) -> None:
        """Test that __init__ creates config directory."""
        nested_dir = temp_dir / "nested" / "config"
        manager = PluginConfigManager(nested_dir)

        assert manager.config_dir.exists()

    def test_save_and_load_yaml(self, manager: PluginConfigManager) -> None:
        """Test saving and loading a YAML config."""
        config = PluginConfig(
            name="yaml-plugin",
            enabled=True,
            priority=150,
            config={"key": "value", "number": 42},
        )

        path = manager.save(config)

        assert path.exists()
        assert path.suffix == ".yaml"

        loaded = manager.load("yaml-plugin")

        assert loaded.name == "yaml-plugin"
        assert loaded.enabled is True
        assert loaded.priority == 150
        assert loaded.config == {"key": "value", "number": 42}

    def test_save_and_load_json(self, manager: PluginConfigManager) -> None:
        """Test saving and loading a JSON config."""
        config = PluginConfig(
            name="json-plugin",
            enabled=False,
            priority=250,
            config={"api_key": "test123"},
        )

        path = manager.save(config, fmt="json")

        assert path.exists()
        assert path.suffix == ".json"

        loaded = manager.load("json-plugin")

        assert loaded.name == "json-plugin"
        assert loaded.enabled is False
        assert loaded.priority == 250

    def test_save_excludes_secrets(self, manager: PluginConfigManager) -> None:
        """Test that secrets are not saved by default."""
        config = PluginConfig(
            name="secret-plugin",
            config={},
            secrets={"password": "hunter2"},
        )

        path = manager.save(config)
        content = path.read_text()

        assert "password" not in content
        assert "hunter2" not in content

    def test_save_includes_secrets_flag(self, manager: PluginConfigManager) -> None:
        """Test that secrets can be included with flag."""
        config = PluginConfig(
            name="secret-plugin",
            config={},
            secrets={"password": "hunter2"},
        )

        path = manager.save(config, include_secrets=True)
        content = path.read_text()

        assert "password" in content
        assert "hunter2" in content

    def test_load_not_found(self, manager: PluginConfigManager) -> None:
        """Test loading non-existent config."""
        with pytest.raises(PluginConfigLoadError) as exc_info:
            manager.load("nonexistent")

        assert "not found" in str(exc_info.value)

    def test_save_validation_error(self, manager: PluginConfigManager) -> None:
        """Test saving invalid config raises error."""
        invalid_config = PluginConfig.__new__(PluginConfig)
        invalid_config.name = ""
        invalid_config.enabled = True
        invalid_config.priority = 100
        invalid_config.config = {}
        invalid_config.secrets = {}

        with pytest.raises(PluginConfigSaveError) as exc_info:
            manager.save(invalid_config)

        assert "validate" in str(exc_info.value).lower() or "name" in str(exc_info.value).lower()

    def test_delete_config(self, manager: PluginConfigManager) -> None:
        """Test deleting a configuration."""
        config = PluginConfig(name="to-delete")
        manager.save(config)

        assert manager.delete("to-delete") is True
        assert manager.delete("to-delete") is False  # Already deleted

    def test_list_configs(self, manager: PluginConfigManager) -> None:
        """Test listing available configurations."""
        manager.save(PluginConfig(name="plugin-a"))
        manager.save(PluginConfig(name="plugin-b"))
        manager.save(PluginConfig(name="plugin-c"))

        configs = manager.list_configs()

        assert configs == ["plugin-a", "plugin-b", "plugin-c"]

    def test_load_registry_empty(self, manager: PluginConfigManager) -> None:
        """Test loading registry when no file exists."""
        registry = manager.load_registry()

        assert len(registry.plugins) == 0
        assert registry.version == 1

    def test_save_and_load_registry(self, manager: PluginConfigManager) -> None:
        """Test saving and loading a full registry."""
        registry = PluginRegistry(version=2)
        registry.add(PluginConfig(name="plugin-a", priority=100))
        registry.add(PluginConfig(name="plugin-b", priority=200, enabled=False))

        path = manager.save_registry(registry)

        assert path.exists()

        loaded = manager.load_registry()

        assert loaded.version == 2
        assert len(loaded.plugins) == 2
        assert loaded.get("plugin-a").enabled is True
        assert loaded.get("plugin-b").enabled is False

    def test_atomic_write(self, manager: PluginConfigManager) -> None:
        """Test that save uses atomic write (no .tmp file left)."""
        config = PluginConfig(name="atomic-test")
        path = manager.save(config)

        # Check no temp file left
        temp_path = path.with_suffix(path.suffix + ".tmp")
        assert not temp_path.exists()


class TestConvenienceFunctions:
    """Tests for module convenience functions."""

    @pytest.fixture
    def temp_dir(self) -> Path:
        """Create a temporary directory for tests."""
        with tempfile.TemporaryDirectory() as tmpdir:
            yield Path(tmpdir)

    def test_load_plugin(self, temp_dir: Path) -> None:
        """Test load_plugin convenience function."""
        config = PluginConfig(name="convenience-test", priority=999)
        save_plugin(config, config_dir=str(temp_dir))

        loaded = load_plugin("convenience-test", config_dir=str(temp_dir))

        assert loaded.name == "convenience-test"
        assert loaded.priority == 999

    def test_save_plugin(self, temp_dir: Path) -> None:
        """Test save_plugin convenience function."""
        config = PluginConfig(name="save-test")

        path = save_plugin(config, config_dir=str(temp_dir))

        assert path.exists()

    def test_load_plugins(self, temp_dir: Path) -> None:
        """Test load_plugins convenience function."""
        registry = PluginRegistry()
        registry.add(PluginConfig(name="test-1"))
        registry.add(PluginConfig(name="test-2"))
        save_plugins(registry, config_dir=str(temp_dir))

        loaded = load_plugins(config_dir=str(temp_dir))

        assert len(loaded.plugins) == 2

    def test_save_plugins(self, temp_dir: Path) -> None:
        """Test save_plugins convenience function."""
        registry = PluginRegistry()
        registry.add(PluginConfig(name="batch-test"))

        path = save_plugins(registry, config_dir=str(temp_dir))

        assert path.exists()


class TestEdgeCases:
    """Test edge cases and error handling."""

    @pytest.fixture
    def temp_dir(self) -> Path:
        """Create a temporary directory for tests."""
        with tempfile.TemporaryDirectory() as td:
            yield Path(td)

    def test_unicode_in_config(self, manager: PluginConfigManager) -> None:
        """Test Unicode characters in config values."""
        config = PluginConfig(
            name="unicode-test",
            config={"message": "Xin chào", "emoji": "🚀"},
        )

        manager.save(config)
        loaded = manager.load("unicode-test")

        assert loaded.config["message"] == "Xin chào"
        assert loaded.config["emoji"] == "🚀"

    def test_special_characters_in_name(self, temp_dir: Path) -> None:
        """Test plugin names with special characters are sanitized."""
        # Slash should be replaced
        config = PluginConfig(name="plugin/with/slashes")
        manager = PluginConfigManager(temp_dir)
        manager.save(config)

        # Filename should not contain slashes
        assert manager.load("plugin_with_slashes") is not None

    def test_large_config(self, manager: PluginConfigManager) -> None:
        """Test handling large configurations."""
        large_config = {f"key_{i}": f"value_{i}" for i in range(1000)}
        config = PluginConfig(name="large-config", config=large_config)

        manager.save(config)
        loaded = manager.load("large-config")

        assert len(loaded.config) == 1000

    def test_corrupted_yaml_file(self, manager: PluginConfigManager) -> None:
        """Test loading corrupted YAML file."""
        path = manager.config_dir / "corrupted.yaml"
        path.write_text("invalid: yaml: : syntax")

        with pytest.raises(PluginConfigLoadError) as exc_info:
            manager.load("corrupted")

        assert "YAML parse error" in str(exc_info.value)

    def test_corrupted_json_file(self, manager: PluginConfigManager) -> None:
        """Test loading corrupted JSON file."""
        path = manager.config_dir / "corrupted.json"
        path.write_text("{invalid json}")

        with pytest.raises(PluginConfigLoadError) as exc_info:
            manager.load("corrupted")

        assert "JSON parse error" in str(exc_info.value)

    def test_empty_file(self, manager: PluginConfigManager) -> None:
        """Test loading empty file."""
        path = manager.config_dir / "empty.yaml"
        path.write_text("")

        # Empty YAML file loads as None, should handle gracefully
        with pytest.raises(PluginConfigLoadError):
            manager.load("empty")
