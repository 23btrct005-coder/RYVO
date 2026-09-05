declare module 'react-map-gl/mapbox' {
  import { ComponentType, ReactNode } from 'react';

  export interface ViewState {
    longitude: number;
    latitude: number;
    zoom: number;
    bearing?: number;
    pitch?: number;
    padding?: { top: number; bottom: number; left: number; right: number };
  }

  export interface MapProps {
    initialViewState?: Partial<ViewState>;
    style?: React.CSSProperties;
    mapStyle?: string;
    mapboxAccessToken?: string;
    children?: ReactNode;
    onMove?: (evt: any) => void;
    onLoad?: (evt: any) => void;
    [key: string]: any;
  }

  export interface MarkerProps {
    longitude: number;
    latitude: number;
    anchor?: string;
    offset?: [number, number];
    children?: ReactNode;
    [key: string]: any;
  }

  export interface SourceProps {
    id: string;
    type: string;
    data?: any;
    children?: ReactNode;
    [key: string]: any;
  }

  export interface LayerProps {
    id: string;
    type: string;
    paint?: Record<string, any>;
    layout?: Record<string, any>;
    [key: string]: any;
  }

  const Map: ComponentType<MapProps>;
  export const Marker: ComponentType<MarkerProps>;
  export const Source: ComponentType<SourceProps>;
  export const Layer: ComponentType<LayerProps>;

  export default Map;
}
