import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { Colors, Spacing, Typography } from '../theme';
import { RootStackParamList } from '../../App';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'AlertSent'>;
  route: RouteProp<RootStackParamList, 'AlertSent'>;
};

export default function AlertSentScreen({ navigation, route }: Props) {
  const { alertId } = route.params;

  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Text style={styles.icon}>✓</Text>
      </View>

      <Text style={styles.heading}>Alert sent</Text>
      <Text style={styles.body}>
        Your emergency contact has been notified. Help is on the way.
      </Text>
      <Text style={styles.alertId}>Alert #{alertId}</Text>

      <TouchableOpacity
        style={styles.button}
        onPress={() => navigation.navigate('Home')}>
        <Text style={styles.buttonText}>Back to home</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.scarlet,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  icon: {
    color: Colors.white,
    fontSize: 48,
    fontWeight: '700',
  },
  heading: {
    ...Typography.heading,
    color: Colors.scarlet,
    marginBottom: Spacing.md,
  },
  body: {
    ...Typography.body,
    textAlign: 'center',
    color: Colors.midGray,
    marginBottom: Spacing.sm,
  },
  alertId: {
    fontSize: 12,
    color: Colors.midGray,
    marginBottom: Spacing.xl,
  },
  button: {
    borderWidth: 1,
    borderColor: Colors.scarlet,
    borderRadius: 8,
    padding: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  buttonText: {
    color: Colors.scarlet,
    fontSize: 16,
    fontWeight: '600',
  },
});
