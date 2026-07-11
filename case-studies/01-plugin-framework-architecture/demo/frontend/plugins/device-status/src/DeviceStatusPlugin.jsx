import React from 'react';
import {
  buildPluginUrl,
  fetchJson,
  MetricCard,
  MetricGrid,
  Panel,
  PluginEyebrow,
  RemoteStatus,
} from '@platform';

const SUMMARY_ENDPOINT = '/summary';
const FALLBACK_API_BASE_PATH = '/api/extensions/device-status';

function summarize(snapshot) {
  const criticalEvents = snapshot.timeline.flatMap((entry) =>
    entry.events.filter((event) => event.severity === 'critical')
  );
  const downDevices = snapshot.devices.filter((device) => !device.reachable);
  const coreEvents = snapshot.timeline.reduce((count, entry) => count + entry.events.length, 0);

  return {
    source: 'host-snapshot',
    coreEvents,
    downDevices: downDevices.length,
    criticalAlerts: criticalEvents.length,
  };
}

export default class DeviceStatusPlugin extends React.Component {
  state = {
    summary: summarize(this.props.snapshot),
    backendStatus: 'Loading plugin backend...',
  };

  componentDidMount() {
    this.loadSummary();
  }

  componentDidUpdate(previousProps) {
    if (previousProps.plugin?.apiBasePath !== this.props.plugin?.apiBasePath) {
      this.loadSummary();
    }
  }

  loadSummary() {
    fetchJson(buildPluginUrl(this.props.plugin, SUMMARY_ENDPOINT, FALLBACK_API_BASE_PATH), 'Plugin API')
      .then((summary) => this.setState({ summary, backendStatus: 'Integrated backend active' }))
      .catch(() =>
        this.setState({
          summary: summarize(this.props.snapshot),
          backendStatus: 'Using host snapshot fallback',
        })
      );
  }

  render() {
    const { summary, backendStatus } = this.state;

    return (
      <Panel className="remote-panel">
        <PluginEyebrow>Remote React plugin</PluginEyebrow>
        <h2>Device status remote</h2>
        <MetricGrid>
          <MetricCard label="Core events" value={summary.coreEvents} />
          <MetricCard label="Down devices" value={summary.downDevices} />
          <MetricCard label="Critical alerts" value={summary.criticalAlerts} />
        </MetricGrid>
        <RemoteStatus>{backendStatus}</RemoteStatus>
      </Panel>
    );
  }
}
